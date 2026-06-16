/**
 * Measures dequeue cost on the input/output queues.
 *
 * Two scenarios, same pipeline (identity head → map → filter → batch(10) → sink):
 *
 *  - backlog: all n items are pushed synchronously before any processing runs
 *    (external push defers processing to a microtask, so the head's input queue
 *    reaches depth n). With a plain-array queue every dequeue then pays
 *    splice(0, batchSize) reindexing against the deep queue; with an O(1)
 *    dequeue structure the depth shouldn't matter.
 *
 *  - steady: items are pumped in respecting input backpressure (the same feed
 *    pattern as fused-vs-composed.cjs), so queues stay shallow. This arm exists
 *    as a regression check: a queue swap must not slow down the common case.
 *
 * Each run reports a checksum (output count and sum) so that an implementation
 * change that corrupts ordering or drops items shows up as a checksum mismatch
 * rather than a fast-but-wrong timing.
 *
 * Usage: node benchmark/queue-backlog.cjs
 * Env overrides: N (default 100000), REPS (default 5), STREAMIE_DIST
 */

// STREAMIE_DIST lets you point at an alternate build (e.g. the pre-change dist).
const streamie = require(process.env.STREAMIE_DIST || '../dist/cjs').default;

const N = Number(process.env.N) || 100_000;
const REPS = Number(process.env.REPS) || 5;

// Identical pipeline for both scenarios; sync handlers so that queue operations,
// not handler latency, dominate the measurement.
function buildPipeline() {
  let count = 0;
  let sum = 0;
  const head = streamie((x) => x, {});
  const tail = head
    .map((x) => x + 1, {})
    .filter((x) => (x & 1) === 0, {})
    .batch(10)
    // sink: true — a consumer-less terminal stage otherwise retains its outputs and
    // parks on output backpressure rather than draining.
    .map((batch) => {
      count += batch.length;
      for (let i = 0; i < batch.length; i++) sum += batch[i];
      return batch.length;
    }, { sink: true });
  return { head, tail, stats: () => ({ count, sum }) };
}

// Pushes [0, n) all at once, in chunks of 1000 only because spreading n args in a
// single call would overflow the stack. No awaits between chunks: processing is
// microtask-deferred, so the full backlog accumulates before any dequeue happens.
async function runBacklog(n) {
  const { head, tail, stats } = buildPipeline();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < n; ) {
    const end = Math.min(i + 1000, n);
    const items = new Array(end - i);
    for (let j = 0; i < end; i++, j++) items[j] = i;
    for (const item of items) head.push(item);
  }
  head.drain();
  await tail.promise;
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { ms, ...stats() };
}

// Pushes [0, n) in small chunks, backing off whenever the head reports input
// backpressure and resuming on its release event, so queues stay near their
// backpressure bounds.
async function runSteady(n) {
  const { head, tail, stats } = buildPipeline();
  const t0 = process.hrtime.bigint();
  await new Promise((resolve) => {
    let i = 0;
    const pump = () => {
      while (i < n && !head.state.backpressure.input) {
        const end = Math.min(i + 50, n);
        const items = [];
        for (; i < end; i++) items.push(i);
        for (const item of items) head.push(item);
      }
      if (i >= n) {
        head.drain();
        resolve();
      }
    };
    head.onBackpressureRelease(pump);
    pump();
  });
  await tail.promise;
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { ms, ...stats() };
}

function median(xs) {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

(async () => {
  console.log(`streamie build: ${process.env.STREAMIE_DIST || '../dist/cjs'}`);
  console.log(`n=${N}, reps=${REPS}\n`);

  for (const [label, run] of [['backlog', runBacklog], ['steady', runSteady]]) {
    const times = [];
    let checksum;
    for (let rep = 0; rep < REPS; rep++) {
      const { ms, count, sum } = await run(N);
      times.push(ms);
      const cs = `count=${count} sum=${sum}`;
      if (checksum && cs !== checksum) throw new Error(`${label}: checksum mismatch (${cs} vs ${checksum})`);
      checksum = cs;
    }
    console.log(`${label.padEnd(8)} median ${median(times).toFixed(1)}ms  [${times.map((t) => t.toFixed(1)).join(', ')}]  ${checksum}`);
  }
})();

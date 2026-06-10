/**
 * Compares a fused stage, configured through the internal (non-public) config:
 *
 *   head.map(handler, { batchSize: 10, flatten: true })   // internal config keys
 *
 * against the public combinator-style equivalent:
 *
 *   head.batch(10).map(handler).flatten()
 *
 * Both pipelines share an identical identity head stage and end in an identical
 * counting sink stage so feeding and output handling costs match. Items are fed
 * through a pump that respects input backpressure, since the input queue is a
 * plain array and letting it grow unboundedly would measure splice() shifting
 * costs instead of pipeline overhead.
 *
 * Usage: node --expose-gc benchmark/fused-vs-composed.js
 * Env overrides: N_SYNC (default 500000), N_ASYNC (default 50000), REPS (default 5)
 */

// STREAMIE_DIST lets you point at an alternate build (e.g. a different tsc target).
const streamie = require(process.env.STREAMIE_DIST || '../dist').default;

const BATCH_SIZE = 10;
const N_SYNC = Number(process.env.N_SYNC) || 500_000;
const N_ASYNC = Number(process.env.N_ASYNC) || 50_000;
const REPS = Number(process.env.REPS) || 5;

const identity = (x) => x;

// Pushes [0, n) into the head streamie in chunks, backing off whenever the
// head reports input backpressure and resuming on its release event.
function feed(head, n) {
  return new Promise((resolve) => {
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
}

// Builds the pipeline, runs n items through it, and returns timing plus a
// checksum (count and sum of outputs) to verify both shapes are equivalent.
async function run({ shape, n, handler, workConfig }) {
  const head = streamie(identity, {});
  let tail;

  if (shape === 'fused') {
    // batchSize/flatten are internal config (the public API expresses them via the
    // batch/flatten combinators); the fused arm exists to measure what fusion buys.
    tail = head.map(handler, { batchSize: BATCH_SIZE, flatten: true, ...workConfig });
  } else {
    tail = head
      .batch(BATCH_SIZE)
      .map(handler, { ...workConfig })
      .flatten();
  }

  let count = 0;
  let sum = 0;
  const sink = tail.map((x) => {
    count++;
    sum += x;
    return x;
  }, {});

  const heapBaseline = process.memoryUsage().heapUsed;
  let heapPeak = heapBaseline;
  const sampler = setInterval(() => {
    const used = process.memoryUsage().heapUsed;
    if (used > heapPeak) heapPeak = used;
  }, 20);

  const start = process.hrtime.bigint();
  await feed(head, n);
  await sink.promise;
  const ms = Number(process.hrtime.bigint() - start) / 1e6;

  clearInterval(sampler);
  return { ms, count, sum, heapPeakMb: (heapPeak - heapBaseline) / 1024 / 1024 };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function compare(label, { n, handler, workConfig }) {
  const results = { fused: [], composed: [] };
  const expectedSum = (n * (n - 1)) / 2;

  // Alternate run order each rep so drift (JIT, GC pressure) cancels out.
  for (let rep = 0; rep < REPS; rep++) {
    const order = rep % 2 === 0 ? ['fused', 'composed'] : ['composed', 'fused'];
    for (const shape of order) {
      if (global.gc) global.gc();
      const result = await run({ shape, n, handler, workConfig });
      if (result.count !== n || result.sum !== expectedSum) {
        throw new Error(`${label}/${shape}: bad output (count ${result.count}, sum ${result.sum})`);
      }
      results[shape].push(result);
    }
  }

  const fusedMs = median(results.fused.map((r) => r.ms));
  const composedMs = median(results.composed.map((r) => r.ms));
  console.log(`\n${label} (n=${n.toLocaleString()}, ${REPS} reps, median)`);
  console.log(`  fused:    ${fusedMs.toFixed(0).padStart(6)} ms  ${(n / fusedMs * 1000 / 1000).toFixed(0).padStart(5)}k items/s  peak heap +${median(results.fused.map((r) => r.heapPeakMb)).toFixed(1)} MB`);
  console.log(`  composed: ${composedMs.toFixed(0).padStart(6)} ms  ${(n / composedMs * 1000 / 1000).toFixed(0).padStart(5)}k items/s  peak heap +${median(results.composed.map((r) => r.heapPeakMb)).toFixed(1)} MB`);
  console.log(`  composed/fused: ${(composedMs / fusedMs).toFixed(2)}x`);
}

(async () => {
  if (!global.gc) console.log('(run with --expose-gc for cleaner memory numbers)');

  await compare('trivial sync handler', {
    n: N_SYNC,
    handler: identity,
    workConfig: {},
  });

  await compare('cpu-light sync handler (~200 sqrt per batch)', {
    n: N_SYNC,
    handler: (batch) => {
      let s = 0;
      for (let j = 0; j < 200; j++) s += Math.sqrt(j);
      if (s < 0) throw new Error('unreachable');
      return batch;
    },
    workConfig: {},
  });

  await compare('async handler (1ms latency, concurrency 32)', {
    n: N_ASYNC,
    handler: async (batch) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return batch;
    },
    workConfig: { concurrency: 32 },
  });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

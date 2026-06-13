import streamie, { fromReadableStream } from '../src';
import { ReadableStream } from 'node:stream/web';

// All of these pipelines need sink behavior to exhibit the problem at all: under
// the retention default, a consumer-less streamie parks on its own output
// backpressure, which already bounds any churn. Only a declared sink (whose outputs
// are discarded by design) can process synchronously without limit — which is
// exactly the degenerate case the time-based yield exists for.
describe('yieldAfter (time-based yield)', () => {
  test('a self-feeding synchronous sink stays interruptible', async () => {
    // Without yielding this pipeline never returns to the event loop: the handler
    // is synchronous and self-feeding, so the process loop never goes idle and the
    // abort timer below could never fire. (A regression here hangs the suite rather
    // than failing an assertion — a starved event loop cannot be observed from
    // inside itself.)
    const s = streamie((n: number, { push }) => {
      push(n + 1);
      return n;
    }, { yieldAfter: 10, sink: true });
    s.push(0);

    const error = new Error('enough');
    setTimeout(() => s.abort(error), 30);

    await expect(s.promise).rejects.toBe(error);
    expect(s.state.count.started).toBeGreaterThan(0);
  });

  test('timers fire during continuous synchronous processing', async () => {
    const s = streamie((n: number, { push }) => {
      push(n + 1);
      return n;
    }, { yieldAfter: 10, sink: true });
    s.push(0);

    let ticks = 0;
    const interval = setInterval(() => { ticks += 1; }, 5);
    await new Promise((resolve) => setTimeout(resolve, 100));
    clearInterval(interval);
    s.abort();
    await s.promise.catch(() => {});

    // Generous bound — exact tick counts are load-dependent. The point is that the
    // event loop turned over at all, which without yielding would be zero ticks.
    expect(ticks).toBeGreaterThan(2);
  });

  test('a synchronous sink over an unbounded stream bridge stays interruptible', async () => {
    // An infinite ReadableStream feeding a synchronous .each: every link in the
    // chain (read resolution, push, delivery, the sink handler) settles in
    // microtasks, so before yielding existed this starved the event loop outright
    // and the abort timer below could never fire.
    let cancelReason: unknown = 'not cancelled';
    const stream = new ReadableStream<number>({
      pull(controller) { controller.enqueue(1); },
      cancel(reason) { cancelReason = reason; },
    });

    const s = fromReadableStream(stream, { yieldAfter: 10 });
    s.each(() => {}, { yieldAfter: 10 });

    const error = new Error('release the stream');
    setTimeout(() => s.abort(error), 30);

    await expect(s.promise).rejects.toBe(error);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cancelReason).toBe(error);
  });
});

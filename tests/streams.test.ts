import streamie from '../src';
import { fromReadableStream, toReadableStream, toWritableStream } from '../src/web';
// ReadableStream/WritableStream/CountQueuingStrategy are web-platform globals (present
// on Node >= 18, the package's WHATWG floor), the same surface a browser consumer uses —
// no node:stream/web import needed now that the bridges speak the real global types.

describe('WHATWG stream bridges', () => {
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  describe('fromReadableStream', () => {
    test('delivers the stream items and drains when the stream ends', async () => {
      const stream = new ReadableStream<number>({
        start(controller) {
          [1, 2, 3].forEach((item) => controller.enqueue(item));
          controller.close();
        },
      });

      const s = fromReadableStream(stream);
      const handled: number[] = [];
      const tail = s.each((item) => { handled.push(item); });

      await tail.promise;
      expect(handled).toEqual([1, 2, 3]);
      expect(s.state.isDrained).toBe(true);
      // The pump releases its reader lock once the stream has ended.
      expect(stream.locked).toBe(false);
    });

    test('an empty stream drains the streamie immediately', async () => {
      const stream = new ReadableStream<number>({
        start(controller) { controller.close(); },
      });

      const s = fromReadableStream(stream);

      await s.promise;
      expect(s.state.isDrained).toBe(true);
    });

    test('thenable chunks emit their settled values', async () => {
      const stream = new ReadableStream<Promise<number>>({
        start(controller) {
          controller.enqueue(Promise.resolve(1));
          controller.enqueue(Promise.resolve(2));
          controller.close();
        },
      });

      const s = fromReadableStream(stream);
      const handled: number[] = [];
      const tail = s.each((item) => { handled.push(item); });

      await tail.promise;
      expect(handled).toEqual([1, 2]);
    });

    test('a stream error aborts the streamie with that error', async () => {
      const error = new Error('stream failed');
      const stream = new ReadableStream<number>({
        start(controller) {
          controller.enqueue(1);
          controller.error(error);
        },
      });

      const s = fromReadableStream(stream);

      await expect(s.promise).rejects.toBe(error);
      expect(s.state.isAborted).toBe(true);
    });

    test('aborting the streamie cancels the stream with the abort error', async () => {
      let cancelReason: unknown = 'not cancelled';
      const stream = new ReadableStream<number>({
        pull(controller) { controller.enqueue(1); },
        cancel(reason) { cancelReason = reason; },
      });

      const s = fromReadableStream(stream);
      const error = new Error('consumer gone');
      s.abort(error);

      await expect(s.promise).rejects.toBe(error);
      await delay(0);
      expect(cancelReason).toBe(error);
      expect(stream.locked).toBe(false);
    });

    test('all consumers halting tears down the bridge and cancels the stream', async () => {
      // The core's halt cascade: the consumer's failure leaves the bridge streamie
      // with no consumers, so it aborts with that error, and the pump cancels the
      // reader — the same contract as pipeTo's source cancellation on a
      // destination error. An unbounded stream is used precisely because a leaked
      // bridge would pull it forever.
      let cancelReason: unknown = 'not cancelled';
      const stream = new ReadableStream<number>({
        pull(controller) { controller.enqueue(1); },
        cancel(reason) { cancelReason = reason; },
      });

      const s = fromReadableStream(stream);
      const tail = s.map(() => { throw new Error('boom'); });

      await expect(tail.promise).rejects.toThrow('boom');
      await expect(s.promise).rejects.toThrow('boom');
      expect(s.state.isAborted).toBe(true);
      await delay(0);
      expect(cancelReason).toBeInstanceOf(Error);
      expect((cancelReason as Error).message).toContain('boom');
      expect(stream.locked).toBe(false);
    });

    test('a failure deeper in the pipeline cascades up and cancels the stream', async () => {
      // The halt cascade is transitive: the tail's death aborts the orphaned mid
      // stage, whose halt in turn aborts the bridge — so a failure at any depth
      // releases the underlying stream with the root error, the contract of pipeTo
      // across a whole pipeThrough chain. No stage tracked anything beyond its
      // direct consumers to get there.
      let pulled = 0;
      let cancelReason: unknown = 'not cancelled';
      const stream = new ReadableStream<number>({
        pull(controller) { controller.enqueue(pulled += 1); },
        cancel(reason) { cancelReason = reason; },
      });

      const s = fromReadableStream(stream, { backpressureAt: 2 });
      const mid = s.map((item) => item, { backpressureAt: 2 });
      const tail = mid.map(() => { throw new Error('boom'); });

      await expect(tail.promise).rejects.toThrow('boom');
      await expect(mid.promise).rejects.toThrow('boom');
      await expect(s.promise).rejects.toThrow('boom');
      expect(mid.state.isAborted).toBe(true);
      expect(s.state.isAborted).toBe(true);

      await delay(0);
      expect(cancelReason).toBeInstanceOf(Error);
      expect((cancelReason as Error).message).toContain('boom');
      expect(stream.locked).toBe(false);
      // The unbounded stream was pulled a handful of times, not indefinitely.
      expect(pulled).toBeLessThan(20);
    });

    test("a consumer abort's error becomes the bridge teardown error", async () => {
      let cancelReason: unknown = 'not cancelled';
      const stream = new ReadableStream<number>({
        pull(controller) { controller.enqueue(1); },
        cancel(reason) { cancelReason = reason; },
      });

      const s = fromReadableStream(stream);
      const tail = s.map((item) => item);
      const error = new Error('consumer gave up');
      tail.abort(error);

      await expect(s.promise).rejects.toBe(error);
      await delay(0);
      expect(cancelReason).toBe(error);
    });

    test('a halt does not tear down the bridge while another consumer survives', async () => {
      // Teardown requires *every* consumer to have halted — one downstream failure
      // must not cancel a stream a sibling is still consuming.
      let cancelReason: unknown = 'not cancelled';
      const stream = new ReadableStream<number>({
        start(controller) {
          [1, 2, 3, 4].forEach((item) => controller.enqueue(item));
          controller.close();
        },
        cancel(reason) { cancelReason = reason; },
      });

      const s = fromReadableStream(stream);
      const survivor: number[] = [];
      const keep = s.each((item) => { survivor.push(item); });
      const doomed = s.map((item) => {
        if (item === 2) throw new Error('boom');
        return item;
      });

      await expect(doomed.promise).rejects.toThrow('boom');
      await keep.promise;
      expect(s.state.isHalted).toBe(false);
      expect(s.state.isDrained).toBe(true);
      expect(survivor).toEqual([1, 2, 3, 4]);
      expect(cancelReason).toBe('not cancelled');
    });

    test('preventCancel: true releases the lock without cancelling the stream', async () => {
      // pipeTo's preventCancel: the pipeline still tears down (the halt cascade
      // doesn't spare the bridge streamie — its downstream is genuinely dead), but
      // the stream itself is left uncancelled and unlocked, readable by another
      // consumer.
      let cancelReason: unknown = 'not cancelled';
      let produced = 0;
      const stream = new ReadableStream<number>({
        pull(controller) { controller.enqueue(produced += 1); },
        cancel(reason) { cancelReason = reason; },
      });

      const s = fromReadableStream(stream, { preventCancel: true });
      const tail = s.map(() => { throw new Error('boom'); });

      await expect(tail.promise).rejects.toThrow('boom');
      await expect(s.promise).rejects.toThrow('boom');
      expect(s.state.isAborted).toBe(true);
      await delay(0);
      expect(cancelReason).toBe('not cancelled');
      expect(stream.locked).toBe(false);

      // The stream survives the pipeline: a fresh reader picks up where the pump
      // left off.
      const reader = stream.getReader();
      const next = await reader.read();
      expect(next.done).toBe(false);
      await reader.cancel();
    });

    test('draining the streamie cancels the stream', async () => {
      let isCancelled = false;
      const stream = new ReadableStream<number>({
        cancel() { isCancelled = true; },
      });

      const s = fromReadableStream(stream);
      s.drain();

      await s.promise;
      await delay(0);
      expect(isCancelled).toBe(true);
    });

    test('only pulls as fast as the pipeline absorbs items', async () => {
      let pulled = 0;
      const stream = new ReadableStream<number>({
        pull(controller) {
          pulled += 1;
          controller.enqueue(pulled);
        },
      }, new CountQueuingStrategy({ highWaterMark: 1 }));

      const s = fromReadableStream(stream, { backpressureAt: 2 });
      const handled: number[] = [];
      s.each(async (item) => {
        await delay(5);
        handled.push(item);
      }, { backpressureAt: 2 });

      await delay(100);
      // Unbounded read-ahead would have pulled thousands of times by now; under
      // backpressure the pump stays within the pipeline's queues of what has been
      // handled.
      expect(handled.length).toBeGreaterThan(5);
      expect(pulled).toBeLessThan(handled.length + 10);

      // The source is infinite; tear the pipeline down so it doesn't keep pulling
      // (and holding timers open) after the test.
      s.abort();
    });
  });

  describe('toWritableStream', () => {
    test('writes all items in order, closes the sink, and resolves', async () => {
      const written: number[] = [];
      let isClosed = false;
      const stream = new WritableStream<number>({
        write(chunk) { written.push(chunk); },
        close() { isClosed = true; },
      });

      const s = streamie((input: number) => input * 2, {});
      [1, 2, 3].forEach((item) => s.push(item));
      s.drain();
      await toWritableStream(s, stream);

      expect(written).toEqual([2, 4, 6]);
      expect(isClosed).toBe(true);
      // The pipe releases its writer lock once the sink has closed.
      expect(stream.locked).toBe(false);
    });

    test('a streamie abort aborts the sink and rejects with the error', async () => {
      let abortReason: unknown = 'not aborted';
      const stream = new WritableStream<number>({
        abort(reason) { abortReason = reason; },
      });

      const s = streamie(async (input: number) => {
        await delay(2);
        return input;
      }, {});
      const piped = toWritableStream(s, stream);
      s.push(1);
      const error = new Error('source gone');
      setTimeout(() => s.abort(error), 10);

      await expect(piped).rejects.toBe(error);
      // No settling delay: the rejection itself guarantees the sink abort has
      // settled and the lock is released (pipeTo's finalization order).
      expect(abortReason).toBe(error);
      expect(stream.locked).toBe(false);
    });

    test('a handler error halting the streamie aborts the sink', async () => {
      let abortReason: unknown = 'not aborted';
      const stream = new WritableStream<number>({
        abort(reason) { abortReason = reason; },
      });

      const s = streamie((input: number) => {
        if (input === 2) throw new Error('boom');
        return input;
      }, {});
      const piped = toWritableStream(s, stream);
      [1, 2].forEach((item) => s.push(item));

      await expect(piped).rejects.toThrow('boom');
      expect(abortReason).toBeInstanceOf(Error);
    });

    test('a source failure rejects only after the sink abort settles', async () => {
      // pipeTo's finalization order: a caller catching the source error must never
      // observe a sink mid-teardown — a slow asynchronous abort() is awaited (and
      // the lock released) before the returned promise rejects.
      let abortSettled = false;
      const stream = new WritableStream<number>({
        async abort() {
          await delay(20);
          abortSettled = true;
        },
      });

      const s = streamie((input: number) => input, {});
      const piped = toWritableStream(s, stream);
      const error = new Error('source gone');
      s.abort(error);

      await expect(piped).rejects.toBe(error);
      expect(abortSettled).toBe(true);
      expect(stream.locked).toBe(false);
    });

    test('a sink write failure aborts the streamie and rejects with the error', async () => {
      const error = new Error('sink failed');
      const stream = new WritableStream<number>({
        write(chunk) {
          if (chunk === 2) throw error;
        },
      });

      const s = streamie((input: number) => input, {});
      const piped = toWritableStream(s, stream);
      [1, 2, 3].forEach((item) => s.push(item));

      await expect(piped).rejects.toBe(error);
      expect(s.state.isAborted).toBe(true);
      await expect(s.promise).rejects.toBe(error);
    });

    test('awaiting the sink paces the source pipeline', async () => {
      let written = 0;
      const stream = new WritableStream<number>({
        async write() {
          written += 1;
          await delay(5);
        },
      }, new CountQueuingStrategy({ highWaterMark: 1 }));

      const s = streamie((input: number) => input, { backpressureAt: 2 });
      const piped = toWritableStream(s, stream);
      let pushed = 0;
      const feed = setInterval(() => {
        if (s.state.backpressure.input) return;
        s.push(pushed += 1);
      }, 1);

      await delay(100);
      clearInterval(feed);
      s.drain();
      await piped;
      // A sink processing ~1 item per 5ms for ~100ms: an unpaced source would have
      // accepted hundreds of items; backpressure keeps intake near what was written.
      expect(written).toBeGreaterThan(5);
      expect(pushed).toBeLessThan(written + 10);
    });
  });

  describe('toReadableStream', () => {
    // The return type exposes only getReader (the minimal structural surface); the
    // runtime value is a genuine ReadableStream. Cast the reader to drive it.
    async function readAll<T>(stream: { getReader(): any }): Promise<T[]> {
      const reader = stream.getReader();
      const out: T[] = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        out.push(value);
      }
      return out;
    }

    test('emits the streamie outputs in order and closes when it drains', async () => {
      const s = streamie((input: number) => input * 2, {});
      [1, 2, 3].forEach((item) => s.push(item));
      s.drain();

      expect(await readAll<number>(toReadableStream(s))).toEqual([2, 4, 6]);
    });

    test('a streamie abort errors the produced stream with that error', async () => {
      const s = streamie((input: number) => input, {});
      const reader = toReadableStream(s).getReader() as any;
      s.push(1);

      expect((await reader.read()).value).toBe(1);
      const error = new Error('source gone');
      s.abort(error);
      await expect(reader.read()).rejects.toBe(error);
    });

    test('a handler error halting the streamie errors the produced stream', async () => {
      const s = streamie((input: number) => {
        if (input === 2) throw new Error('boom');
        return input;
      }, {});
      const reader = toReadableStream(s).getReader() as any;
      [1, 2].forEach((item) => s.push(item));

      // The halt's error preempts any buffered-but-unread output (error propagation is
      // immediate, not queued behind in-flight items), so item 1 may or may not have
      // surfaced before the rejection lands — read until it does.
      await expect((async () => {
        while (true) await reader.read();
      })()).rejects.toThrow('boom');
    });

    test('an enqueue failure detaches the readable consumer', async () => {
      const error = new Error('size failed');
      const s = streamie((input: number) => input, {});
      const readable = toReadableStream(s, {
        highWaterMark: 1,
        size() { throw error; },
      });

      // With no reader yet, the produced ReadableStream pulls ahead into its internal
      // queue; the custom size() failure makes controller.enqueue throw.
      s.push(1);
      await delay(0);
      const reader = readable.getReader() as any;
      await expect(reader.read()).rejects.toBe(error);

      // The detach path is intentionally microtask-deferred by async iteration.
      await delay(0);
      s.push(2);
      await delay(0);

      const seen: number[] = [];
      const late = s.each((item) => { seen.push(item); });
      s.drain();
      await late.promise;

      expect(seen).toEqual([2]);
      expect(s.state.isAborted).toBe(false);
    });

    test('throws on a sink streamie, which has no consumable output', () => {
      // A sink (.each/.sink) discards its outputs, so it refuses consumers — and
      // toReadableStream registers one. The throw is synchronous, at the call: it is
      // the same contract as any other attempt to consume a sink, surfaced here rather
      // than handed back as a stream that would only ever produce nothing.
      const s = streamie((input: number) => input, {});
      const sink = s.each((item) => item);

      expect(() => toReadableStream(sink)).toThrow('Cannot register an output on a sink streamie.');
    });

    test('an already-drained streamie produces an immediately-closing stream', async () => {
      const s = streamie((input: number) => input, {});
      s.drain();
      await s.promise;

      const reader = toReadableStream(s).getReader() as any;
      expect((await reader.read()).done).toBe(true);
    });

    test('an already-aborted streamie produces an errored stream', async () => {
      const s = streamie((input: number) => input, {});
      const error = new Error('already gone');
      s.abort(error);

      const reader = toReadableStream(s).getReader() as any;
      await expect(reader.read()).rejects.toBe(error);
    });

    test('cancelling the stream detaches as a voluntary departure, sparing a sibling', async () => {
      // Cancel is the ReadableStream equivalent of breaking a for-await: a voluntary
      // detach, not a failure. A sibling consumer must finish unaffected, and the
      // streamie must not abort.
      const s = streamie((input: number) => input, {});
      const seen: number[] = [];
      const sink = s.each((item) => { seen.push(item); });

      const reader = toReadableStream(s).getReader() as any;
      [1, 2, 3, 4].forEach((item) => s.push(item));
      s.drain();

      // Detach the readable consumer without draining it; the sibling sink proceeds.
      await reader.cancel();
      await sink.promise;

      expect(seen).toEqual([1, 2, 3, 4]);
      expect(s.state.isAborted).toBe(false);
      expect(s.state.isDrained).toBe(true);
    });

    test('cancelling the sole consumer parks the streamie rather than aborting it', async () => {
      // A voluntary detach that leaves the streamie consumer-less parks it (retained
      // outputs, no upstream cascade) — it does not abort, exactly as an iterator
      // break wouldn't.
      const s = streamie((input: number) => input, {});
      const reader = toReadableStream(s).getReader() as any;
      s.push(1);

      expect((await reader.read()).value).toBe(1);
      await reader.cancel();
      await delay(0);

      expect(s.state.isAborted).toBe(false);
      expect(s.state.isHalted).toBe(false);
    });

    test('is pull-driven: a slow reader paces the pipeline', async () => {
      const s = streamie((input: number) => input, { backpressureAt: 2 });
      const reader = toReadableStream(s).getReader() as any;

      let pushed = 0;
      const feed = setInterval(() => {
        if (s.state.backpressure.input) return;
        s.push(pushed += 1);
      }, 1);

      const got: number[] = [];
      for (let i = 0; i < 5; i++) {
        got.push((await reader.read()).value);
        await delay(5);
      }
      await reader.cancel();
      clearInterval(feed);

      expect(got).toEqual([1, 2, 3, 4, 5]);
      // An unpaced source would have produced far more; read backpressure keeps intake
      // within the pipeline's bounded queues of what has been consumed.
      expect(pushed).toBeLessThan(got.length + 10);
    });

    test('accepts a queuing strategy and still delivers in order', async () => {
      const s = streamie((input: number) => input, {});
      [1, 2, 3].forEach((item) => s.push(item));
      s.drain();

      expect(await readAll<number>(toReadableStream(s, { highWaterMark: 4 }))).toEqual([1, 2, 3]);
    });
  });

  test('round trip: ReadableStream through a pipeline into a ReadableStream', async () => {
    const source = new ReadableStream<number>({
      start(controller) {
        [1, 2, 3, 4].forEach((item) => controller.enqueue(item));
        controller.close();
      },
    });

    const out = toReadableStream(
      fromReadableStream(source)
        .filter((item) => item % 2 === 0)
        .map((item) => item * 10),
    );

    const reader = out.getReader() as any;
    const got: number[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      got.push(value);
    }
    expect(got).toEqual([20, 40]);
  });

  test('round trip: ReadableStream through a pipeline into a WritableStream', async () => {
    const stream = new ReadableStream<number>({
      start(controller) {
        [1, 2, 3, 4].forEach((item) => controller.enqueue(item));
        controller.close();
      },
    });
    const written: number[] = [];
    const sink = new WritableStream<number>({
      write(chunk) { written.push(chunk); },
    });

    await toWritableStream(
      fromReadableStream(stream)
        .filter((item) => item % 2 === 0)
        .map((item) => item * 10),
      sink,
    );

    expect(written).toEqual([20, 40]);
  });
});

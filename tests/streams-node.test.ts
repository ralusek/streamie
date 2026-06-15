import streamie from '../src';
import { fromReadable, toReadable, toWritable } from '../src/node';
import { Readable, Writable } from 'node:stream';

describe('Node stream bridges', () => {
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // A Readable whose chunks are produced on demand by a generator, so backpressure
  // tests can count how far ahead of the consumer it was pulled.
  function countingReadable(): { readable: Readable; pulled: () => number; destroyed: () => boolean } {
    let pulled = 0;
    let destroyed = false;
    const readable = new Readable({
      objectMode: true,
      // Cap Node's own internal read-ahead to one item (the objectMode default is 16):
      // the backpressure tests count pulls against the consumer, so the source mustn't
      // buffer far ahead on its own. The WHATWG suite does the same via a
      // CountQueuingStrategy({ highWaterMark: 1 }).
      highWaterMark: 1,
      read() {
        pulled += 1;
        this.push(pulled);
      },
      destroy(error, callback) {
        destroyed = true;
        callback(error);
      },
    });
    return { readable, pulled: () => pulled, destroyed: () => destroyed };
  }

  describe('fromReadable', () => {
    test('delivers the stream items and drains when the stream ends', async () => {
      const readable = Readable.from([1, 2, 3], { objectMode: true });

      const s = fromReadable<number>(readable);
      const handled: number[] = [];
      const tail = s.each((item) => { handled.push(item); });

      await tail.promise;
      expect(handled).toEqual([1, 2, 3]);
      expect(s.state.isDrained).toBe(true);
    });

    test('an empty stream drains the streamie immediately', async () => {
      const readable = Readable.from([], { objectMode: true });

      const s = fromReadable<number>(readable);

      await s.promise;
      expect(s.state.isDrained).toBe(true);
    });

    test('thenable chunks emit their settled values', async () => {
      const readable = Readable.from(
        [Promise.resolve(1), Promise.resolve(2)],
        { objectMode: true },
      );

      const s = fromReadable<Promise<number>>(readable);
      const handled: number[] = [];
      const tail = s.each((item) => { handled.push(item); });

      await tail.promise;
      expect(handled).toEqual([1, 2]);
    });

    test('a stream error aborts the streamie with that error', async () => {
      const error = new Error('stream failed');
      const readable = new Readable({
        objectMode: true,
        read() {
          this.push(1);
          this.destroy(error);
        },
      });

      const s = fromReadable<number>(readable);

      await expect(s.promise).rejects.toBe(error);
      expect(s.state.isAborted).toBe(true);
    });

    test('aborting the streamie destroys the stream', async () => {
      const { readable, destroyed } = countingReadable();

      const s = fromReadable<number>(readable);
      const error = new Error('consumer gone');
      s.abort(error);

      await expect(s.promise).rejects.toBe(error);
      await delay(0);
      expect(destroyed()).toBe(true);
    });

    test('all consumers halting tears down the bridge and destroys the stream', async () => {
      // The core's halt cascade: the consumer's failure leaves the bridge streamie with
      // no consumers, so it aborts, and the pump destroys the readable. An unbounded
      // stream is used precisely because a leaked bridge would pull it forever.
      const { readable, destroyed } = countingReadable();

      const s = fromReadable<number>(readable);
      const tail = s.map(() => { throw new Error('boom'); });

      await expect(tail.promise).rejects.toThrow('boom');
      await expect(s.promise).rejects.toThrow('boom');
      expect(s.state.isAborted).toBe(true);
      await delay(0);
      expect(destroyed()).toBe(true);
    });

    test('a consumer abort tears down the bridge and destroys the stream', async () => {
      // A downstream consumer aborting leaves the bridge streamie with no consumers, so
      // it aborts (the upstream cascade) and the pump destroys the source. Node's
      // teardown destroy is error-free — the consumer's error tears the pipeline down
      // and rejects the bridge's promise, but is not pushed into the source as a stream
      // error (the equivalent of the WHATWG bridge passing it to reader.cancel()).
      const { readable, destroyed } = countingReadable();

      const s = fromReadable<number>(readable);
      const tail = s.map((item) => item);
      const error = new Error('consumer gave up');
      tail.abort(error);

      await expect(s.promise).rejects.toBe(error);
      await delay(0);
      expect(destroyed()).toBe(true);
    });

    test('a failure deeper in the pipeline cascades up and destroys the stream', async () => {
      const { readable, destroyed, pulled } = countingReadable();

      const s = fromReadable<number>(readable, { backpressureAt: 2 });
      const mid = s.map((item) => item, { backpressureAt: 2 });
      const tail = mid.map(() => { throw new Error('boom'); });

      await expect(tail.promise).rejects.toThrow('boom');
      await expect(mid.promise).rejects.toThrow('boom');
      await expect(s.promise).rejects.toThrow('boom');
      expect(mid.state.isAborted).toBe(true);
      expect(s.state.isAborted).toBe(true);

      await delay(0);
      expect(destroyed()).toBe(true);
      // The unbounded stream was pulled a handful of times, not indefinitely.
      expect(pulled()).toBeLessThan(20);
    });

    test('draining the streamie destroys the stream', async () => {
      const { readable, destroyed } = countingReadable();

      const s = fromReadable<number>(readable);
      s.drain();

      await s.promise;
      await delay(0);
      expect(destroyed()).toBe(true);
    });

    test('only pulls as fast as the pipeline absorbs items', async () => {
      const { readable, pulled } = countingReadable();

      const s = fromReadable<number>(readable, { backpressureAt: 2 });
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
      expect(pulled()).toBeLessThan(handled.length + 20);

      // The source is infinite; tear the pipeline down so it doesn't keep pulling.
      s.abort();
    });
  });

  describe('toWritable', () => {
    function collectingWritable(opts: {
      onWrite?: (chunk: any) => void;
      onClose?: () => void;
    } = {}): Writable {
      return new Writable({
        objectMode: true,
        write(chunk, _encoding, callback) {
          opts.onWrite?.(chunk);
          callback();
        },
        final(callback) {
          opts.onClose?.();
          callback();
        },
      });
    }

    test('writes all items in order, finishes the sink, and resolves', async () => {
      const written: number[] = [];
      let isClosed = false;
      const writable = collectingWritable({
        onWrite: (chunk) => written.push(chunk),
        onClose: () => { isClosed = true; },
      });

      const s = streamie((input: number) => input * 2, {});
      [1, 2, 3].forEach((item) => s.push(item));
      s.drain();
      await toWritable(s, writable);

      expect(written).toEqual([2, 4, 6]);
      expect(isClosed).toBe(true);
    });

    test('a streamie abort destroys the sink and rejects with the error', async () => {
      let destroyReason: unknown = 'not destroyed';
      const writable = new Writable({
        objectMode: true,
        write(_chunk, _encoding, callback) { callback(); },
        destroy(error, callback) { destroyReason = error; callback(error); },
      });

      const s = streamie(async (input: number) => {
        await delay(2);
        return input;
      }, {});
      const piped = toWritable(s, writable);
      s.push(1);
      const error = new Error('source gone');
      setTimeout(() => s.abort(error), 10);

      await expect(piped).rejects.toBe(error);
      expect(destroyReason).toBe(error);
    });

    test('a handler error halting the streamie destroys the sink', async () => {
      let destroyReason: unknown = 'not destroyed';
      const writable = new Writable({
        objectMode: true,
        write(_chunk, _encoding, callback) { callback(); },
        destroy(error, callback) { destroyReason = error; callback(error); },
      });

      const s = streamie((input: number) => {
        if (input === 2) throw new Error('boom');
        return input;
      }, {});
      const piped = toWritable(s, writable);
      [1, 2].forEach((item) => s.push(item));

      await expect(piped).rejects.toThrow('boom');
      expect(destroyReason).toBeInstanceOf(Error);
    });

    test('a sink write failure aborts the streamie and rejects with the error', async () => {
      const error = new Error('sink failed');
      const writable = new Writable({
        objectMode: true,
        write(chunk, _encoding, callback) {
          if (chunk === 2) return callback(error);
          callback();
        },
      });

      const s = streamie((input: number) => input, {});
      const piped = toWritable(s, writable);
      [1, 2, 3].forEach((item) => s.push(item));

      await expect(piped).rejects.toBe(error);
      expect(s.state.isAborted).toBe(true);
      await expect(s.promise).rejects.toBe(error);
    });

    test('a sink that closes early aborts the streamie and rejects, rather than hanging', async () => {
      // An external destroy()/close of the sink before the pipeline finishes must not
      // leave toWritable pending: the next write() would merely return false and the
      // loop would park on a 'drain' that never comes. The early close is a sink
      // failure — it aborts the source and rejects the returned promise.
      const writable = new Writable({
        objectMode: true,
        highWaterMark: 1,
        write(_chunk, _encoding, callback) { setTimeout(callback, 5); },
      });

      const s = streamie((input: number) => input, { backpressureAt: 2 });
      const piped = toWritable(s, writable);
      let pushed = 0;
      const feed = setInterval(() => {
        // The abort lands asynchronously, so this can tick once after it; pushing to a
        // halted streamie throws, so bail when it (or anything upstream) has terminated.
        if (s.state.isHalted || s.state.backpressure.input) return;
        s.push(pushed += 1);
      }, 1);

      try {
        // Destroy the sink out from under the still-running pipeline.
        setTimeout(() => writable.destroy(), 20);

        await expect(piped).rejects.toThrow('closed before the pipeline finished');
        expect(s.state.isAborted).toBe(true);
      } finally {
        clearInterval(feed);
      }
    });

    test('awaiting drain paces the source pipeline', async () => {
      let written = 0;
      const writable = new Writable({
        objectMode: true,
        highWaterMark: 1,
        write(_chunk, _encoding, callback) {
          written += 1;
          setTimeout(callback, 5);
        },
      });

      const s = streamie((input: number) => input, { backpressureAt: 2 });
      const piped = toWritable(s, writable);
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
      expect(pushed).toBeLessThan(written + 20);
    });
  });

  describe('toReadable', () => {
    async function readAll<T>(readable: Readable): Promise<T[]> {
      const out: T[] = [];
      for await (const item of readable) out.push(item as T);
      return out;
    }

    test('emits the streamie outputs in order and ends when it drains', async () => {
      const s = streamie((input: number) => input * 2, {});
      [1, 2, 3].forEach((item) => s.push(item));
      s.drain();

      expect(await readAll<number>(toReadable(s))).toEqual([2, 4, 6]);
    });

    test('a streamie abort errors the produced stream with that error', async () => {
      const s = streamie((input: number) => input, {});
      const readable = toReadable(s);
      s.push(1);

      const iterator = readable[Symbol.asyncIterator]();
      expect((await iterator.next()).value).toBe(1);
      const error = new Error('source gone');
      s.abort(error);
      await expect(iterator.next()).rejects.toBe(error);
    });

    test('a handler error halting the streamie errors the produced stream', async () => {
      const s = streamie((input: number) => {
        if (input === 2) throw new Error('boom');
        return input;
      }, {});
      const readable = toReadable(s);
      [1, 2].forEach((item) => s.push(item));

      await expect(readAll<number>(readable)).rejects.toThrow('boom');
    });

    test('throws on a sink streamie, which has no consumable output', () => {
      const s = streamie((input: number) => input, {});
      const sink = s.each((item) => item);

      expect(() => toReadable(sink)).toThrow('Cannot register an output on a sink streamie.');
    });

    test('an already-drained streamie produces an immediately-ending stream', async () => {
      const s = streamie((input: number) => input, {});
      s.drain();
      await s.promise;

      expect(await readAll<number>(toReadable(s))).toEqual([]);
    });

    test('an already-aborted streamie produces an errored stream', async () => {
      const s = streamie((input: number) => input, {});
      const error = new Error('already gone');
      s.abort(error);

      await expect(readAll<number>(toReadable(s))).rejects.toBe(error);
    });

    test('destroying the stream detaches as a voluntary departure, sparing a sibling', async () => {
      const s = streamie((input: number) => input, {});
      const seen: number[] = [];
      const sink = s.each((item) => { seen.push(item); });

      const readable = toReadable(s);
      [1, 2, 3, 4].forEach((item) => s.push(item));
      s.drain();

      // Detach the readable consumer without draining it; the sibling sink proceeds.
      readable.destroy();
      await sink.promise;

      expect(seen).toEqual([1, 2, 3, 4]);
      expect(s.state.isAborted).toBe(false);
      expect(s.state.isDrained).toBe(true);
    });

    test('is pull-driven: a slow reader paces the pipeline', async () => {
      const s = streamie((input: number) => input, { backpressureAt: 2 });
      const readable = toReadable(s);
      const iterator = readable[Symbol.asyncIterator]();

      let pushed = 0;
      const feed = setInterval(() => {
        if (s.state.backpressure.input) return;
        s.push(pushed += 1);
      }, 1);

      const got: number[] = [];
      for (let i = 0; i < 5; i++) {
        got.push((await iterator.next()).value);
        await delay(5);
      }
      await iterator.return?.();
      clearInterval(feed);

      expect(got).toEqual([1, 2, 3, 4, 5]);
      // An unpaced source would have produced far more; read backpressure keeps intake
      // within the pipeline's bounded queues of what has been consumed.
      expect(pushed).toBeLessThan(got.length + 20);
    });

    test('defaults to a read-ahead of one item, like the WHATWG bridge', async () => {
      // Without an explicit highWaterMark the produced stream must not inherit Node's
      // object-mode default of 16 and slurp items out of the streamie ahead of a slow
      // consumer; toReadable defaults it to 1, matching toReadableStream.
      const s = streamie((input: number) => input, { backpressureAt: 1000 });
      for (let i = 0; i < 20; i++) s.push(i);
      s.drain();

      const readable = toReadable(s);
      const iterator = readable[Symbol.asyncIterator]();
      // The first read sets the stream flowing; it then refills its buffer up to the
      // high water mark from the (amply stocked) streamie.
      expect((await iterator.next()).value).toBe(0);
      await delay(10);
      // A default of 16 would have buffered ~16 items here; a tight default of 1 keeps
      // the produced stream's own buffer at a single item (plus at most one in flight).
      expect(readable.readableLength).toBeLessThanOrEqual(3);
      await iterator.return?.();
    });

    test('honors an explicit highWaterMark for deeper read-ahead', async () => {
      const s = streamie((input: number) => input, { backpressureAt: 1000 });
      for (let i = 0; i < 20; i++) s.push(i);
      s.drain();

      const readable = toReadable(s, { highWaterMark: 8 });
      const iterator = readable[Symbol.asyncIterator]();
      expect((await iterator.next()).value).toBe(0);
      await delay(10);
      // An explicit high water mark is respected: the stream reads further ahead.
      expect(readable.readableLength).toBeGreaterThan(3);
      await iterator.return?.();
    });
  });

  test('round trip: Readable through a pipeline into a Readable', async () => {
    const source = Readable.from([1, 2, 3, 4], { objectMode: true });

    const out = toReadable(
      fromReadable<number>(source)
        .filter((item) => item % 2 === 0)
        .map((item) => item * 10),
    );

    const got: number[] = [];
    for await (const item of out) got.push(item as number);
    expect(got).toEqual([20, 40]);
  });

  test('round trip: Readable through a pipeline into a Writable', async () => {
    const source = Readable.from([1, 2, 3, 4], { objectMode: true });
    const written: number[] = [];
    const sink = new Writable({
      objectMode: true,
      write(chunk, _encoding, callback) { written.push(chunk); callback(); },
    });

    await toWritable(
      fromReadable<number>(source)
        .filter((item) => item % 2 === 0)
        .map((item) => item * 10),
      sink,
    );

    expect(written).toEqual([20, 40]);
  });
});

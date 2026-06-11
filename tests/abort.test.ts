import streamie from '../src';
import { StreamieQueueError } from '../src/error';
import type { StreamieHaltPayload } from '../src/types';

describe('abort', () => {
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  test('abort rejects the promise with the provided error', async () => {
    const s = streamie((input: number) => input, {});
    const error = new Error('external failure');

    s.abort(error);

    expect(s.state.isHalted).toBe(true);
    expect(s.state.isAborted).toBe(true);
    await expect(s.promise).rejects.toBe(error);
  });

  test('a bare abort rejects the promise with a generic abort error', async () => {
    const s = streamie((input: number) => input, {});

    s.abort();

    await expect(s.promise).rejects.toThrow('Streamie was aborted.');
  });

  test('onHalted payload distinguishes an abort from a handler-error halt', async () => {
    const aborted = streamie((input: number) => input, {});
    const error = new Error('external failure');
    aborted.abort(error);

    let abortedPayload: StreamieHaltPayload<number> | null = null;
    aborted.onHalted((payload) => { abortedPayload = payload; });
    expect(abortedPayload).toEqual({ isAborted: true, abortError: error, lastError: null });

    const errored = streamie(() => {
      throw new Error('boom');
    }, {});
    errored.push(1);
    await errored.promise.catch(() => {});

    let erroredPayload: StreamieHaltPayload<unknown> | null = null;
    errored.onHalted((payload) => { erroredPayload = payload; });
    expect(erroredPayload!.isAborted).toBe(false);
    expect(erroredPayload!.abortError).toBeUndefined();
    expect(erroredPayload!.lastError).toBeInstanceOf(StreamieQueueError);
  });

  test('an abort after a non-halting handler error preserves both errors in the payload', async () => {
    const s = streamie((input: number) => {
      if (input === 1) throw new Error('boom');
      return input;
    }, { haltOnError: false });

    s.push(1);
    // Wait for the handler error to have been recorded.
    await new Promise<void>((resolve) => s.onError(() => resolve()));

    const error = new Error('external failure');
    s.abort(error);

    let payload: StreamieHaltPayload<number> | null = null;
    s.onHalted((p) => { payload = p; });
    expect(payload!.isAborted).toBe(true);
    expect(payload!.abortError).toBe(error);
    expect(payload!.lastError).toBeInstanceOf(StreamieQueueError);
  });

  test('queued push receipts reject with the abort error', async () => {
    const s = streamie(async (input: number) => {
      await delay(5);
      return input;
    }, {});

    // Processing is deferred to a microtask, so aborting synchronously after the
    // pushes catches every item still queued.
    const receipts = [1, 2, 3].map((item) => s.push(item));
    const error = new Error('external failure');
    s.abort(error);

    await expect(receipts[0].promise).rejects.toBe(error);
    await expect(receipts[2].promise).rejects.toBe(error);
  });

  test('abort is idempotent and a no-op after drain', async () => {
    const s = streamie((input: number) => input, {});
    s.push(1);
    s.drain();
    await s.promise;

    s.abort(new Error('too late'));
    expect(s.state.isHalted).toBe(false);
    expect(s.state.isAborted).toBe(false);
    await s.promise; // still resolved

    const aborted = streamie((input: number) => input, {});
    const error = new Error('first');
    aborted.abort(error);
    aborted.abort(new Error('second'));
    await expect(aborted.promise).rejects.toBe(error);
  });

  test('an abort cascades down a chain, rejecting downstream promises', async () => {
    const source = streamie((input: number) => input, {});
    const tail = source
      .map((input) => input * 2)
      .map((input) => input + 1);

    const error = new Error('upstream gone');
    source.abort(error);

    expect(tail.state.isHalted).toBe(true);
    expect(tail.state.isAborted).toBe(true);
    await expect(tail.promise).rejects.toBe(error);
  });

  test('a consumer aborts only once all of its inputs have aborted', async () => {
    const a = streamie((input: number) => input, {});
    const b = streamie((input: number) => input, {});
    const consumer = streamie((input: number) => input, {});
    consumer.registerInput(a);
    consumer.registerInput(b);

    a.abort(new Error('a failed'));
    expect(consumer.state.isHalted).toBe(false);

    b.abort(new Error('b failed'));
    expect(consumer.state.isAborted).toBe(true);

    // Multiple upstream abort errors are aggregated.
    const rejection = await consumer.promise.then(() => null, (error) => error);
    expect(rejection).toBeInstanceOf(AggregateError);
    expect((rejection as AggregateError).errors.map((e: Error) => e.message)).toEqual([
      'a failed',
      'b failed',
    ]);
  });

  test('all upstreams bare-aborting cascades as a bare abort with the generic error', async () => {
    const a = streamie((input: number) => input, {});
    const b = streamie((input: number) => input, {});
    const consumer = streamie((input: number) => input, {});
    consumer.registerInput(a);
    consumer.registerInput(b);

    a.abort();
    b.abort();

    expect(consumer.state.isAborted).toBe(true);
    await expect(consumer.promise).rejects.toThrow('Streamie was aborted.');
  });

  test('abort after a handler-error halt is a no-op', async () => {
    const s = streamie(() => {
      throw new Error('boom');
    }, {});
    s.push(1);
    await s.promise.catch(() => {});
    expect(s.state.isHalted).toBe(true);

    s.abort(new Error('too late'));

    expect(s.state.isAborted).toBe(false);
    let payload: StreamieHaltPayload<unknown> | null = null;
    s.onHalted((p) => { payload = p; });
    expect(payload!.isAborted).toBe(false);
    await expect(s.promise).rejects.toBeInstanceOf(StreamieQueueError);
  });

  test('abort interrupts an in-flight drain', async () => {
    const s = streamie(async (input: number) => {
      await delay(20);
      return input;
    }, {});
    s.push(1);
    s.drain();
    expect(s.state.isDrained).toBe(false);

    const error = new Error('changed my mind');
    s.abort(error);

    expect(s.state.isAborted).toBe(true);
    await expect(s.promise).rejects.toBe(error);
  });

  test('a for await on the tail of an aborted chain rejects with the origin error', async () => {
    const source = streamie(async (input: number) => {
      await delay(2);
      return input;
    }, {});
    const tail = source.map((input) => input * 2);

    const iteration = (async () => {
      for await (const item of tail) void item;
    })();
    source.push(1);
    const error = new Error('origin failure');
    setTimeout(() => source.abort(error), 10);

    await expect(iteration).rejects.toBe(error);
  });

  test('mixed terminations drain: one input drains, the other aborts', async () => {
    const a = streamie((input: number) => input, {});
    const b = streamie((input: number) => input, {});
    const handled: number[] = [];
    const consumer = streamie((input: number) => { handled.push(input); }, {});
    consumer.registerInput(a);
    consumer.registerInput(b);

    b.abort(new Error('b failed'));
    a.push(1);
    a.drain();

    await consumer.promise;
    expect(consumer.state.isAborted).toBe(false);
    expect(handled).toEqual([1]);
  });

  test('a for await loop rejects with the abort error', async () => {
    const s = streamie(async (input: number) => {
      await delay(2);
      return input;
    }, {});

    const error = new Error('source gone');
    const iteration = (async () => {
      for await (const item of s) void item;
    })();
    s.push(1);
    setTimeout(() => s.abort(error), 10);

    await expect(iteration).rejects.toBe(error);
  });

  test('falsey abort errors are delivered, not swallowed', async () => {
    // Falsey reasons must not be mistaken for "no stored error" by the iterator,
    // which would leave the loop hanging instead of rejecting.
    const s = streamie((input: number) => input, {});
    s.abort(false);
    await expect(s.promise).rejects.toBe(false);

    const iteration = (async () => {
      for await (const item of s) void item;
    })();
    await expect(iteration).rejects.toBe(false);

    const active = streamie(async (input: number) => {
      await delay(2);
      return input;
    }, {});
    const activeIteration = (async () => {
      for await (const item of active) void item;
    })();
    active.push(1);
    setTimeout(() => active.abort(0), 10);
    await expect(activeIteration).rejects.toBe(0);
  });

  test('a null abort error is delivered as null, not replaced by the generic error', async () => {
    const s = streamie(async (input: number) => {
      await delay(5);
      return input;
    }, {});
    const receipt = s.push(1);
    s.abort(null);

    await expect(s.promise).rejects.toBeNull();
    await expect(receipt.promise).rejects.toBeNull();

    const iteration = (async () => {
      for await (const item of s) void item;
    })();
    await expect(iteration).rejects.toBeNull();
  });

  test('iterating an already-aborted streamie rejects with the abort error', async () => {
    const s = streamie((input: number) => input, {});
    const error = new Error('source gone');
    s.abort(error);

    const iteration = (async () => {
      for await (const item of s) void item;
    })();

    await expect(iteration).rejects.toBe(error);
  });
});

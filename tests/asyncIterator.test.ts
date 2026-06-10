import streamie from '../src';
import { StreamieQueueError } from '../src/error';

describe('Async iteration', () => {
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  test('Iterates all outputs of a streamie in order', async () => {
    const s = streamie(async (input: number) => input * 2, {});
    s.push(1, 2, 3, 4, 5);
    s.drain();

    const results: number[] = [];
    for await (const item of s) {
      results.push(item);
    }

    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(s.state.isDrained).toBe(true);
  });

  test('Iterates outputs of a synchronous handler', async () => {
    const s = streamie((input: number) => input + 1, {});
    s.push(1, 2, 3);
    s.drain();

    const results: number[] = [];
    for await (const item of s) {
      results.push(item);
    }

    expect(results).toEqual([2, 3, 4]);
  });

  test('Iterates the end of a pipeline', async () => {
    const s = streamie(async (input: number) => input * 2, {});
    const piped = s
      .filter((item) => item % 4 === 0)
      .map(async (item) => item / 4);

    s.push(1, 2, 3, 4, 5, 6, 7, 8);
    s.drain();

    const results: number[] = [];
    for await (const item of piped) {
      results.push(item);
    }

    expect(results).toEqual([1, 2, 3, 4]);
  });

  test('A slow consumer exerts backpressure on the source', async () => {
    const s = streamie((input: number) => input, { backpressureAt: { output: 4 } });
    s.push(...Array.from({ length: 30 }, (_, i) => i));
    s.drain();

    const results: number[] = [];
    for await (const item of s) {
      // The source must never run ahead of the iterator's pulls by more than its
      // own bounded output queue.
      expect(s.state.count.queued.output).toBeLessThanOrEqual(4);
      results.push(item);
      await delay(1);
    }

    expect(results.length).toBe(30);
  });

  test('Rejects when the source errors', async () => {
    const s = streamie(async (input: number) => {
      if (input === 3) throw new Error('boom');
      return input;
    }, {});
    s.push(1, 2, 3, 4);
    s.drain();

    const results: number[] = [];
    let caught: unknown = null;
    try {
      for await (const item of s) {
        results.push(item);
      }
    } catch (err) {
      caught = err;
    }

    expect(results).toEqual([1, 2]);
    expect(caught).toBeInstanceOf(StreamieQueueError);
    expect(((caught as StreamieQueueError<number>).originalError as Error).message).toBe('boom');

    // The source's own promise rejects with the same error.
    await expect(s.promise).rejects.toBe(caught);
  });

  test('Breaking out of iteration detaches the consumer without disturbing the source', async () => {
    let handled = 0;
    const s = streamie(async (input: number) => {
      handled++;
      return input;
    }, {});
    s.push(1, 2, 3, 4, 5, 6);
    s.drain();

    const results: number[] = [];
    for await (const item of s) {
      results.push(item);
      if (results.length === 2) break;
    }

    expect(results).toEqual([1, 2]);

    // With the iterator detached, the source continues processing and drains normally.
    await s.promise;
    expect(handled).toBe(6);
    expect(s.state.isDrained).toBe(true);
  });

  test('Receives items pushed while iteration is in flight', async () => {
    const s = streamie(async (input: number) => input, {});
    s.push(1, 2);

    setTimeout(() => s.push(3, 4), 5);
    setTimeout(() => {
      s.push(5);
      s.drain();
    }, 10);

    const results: number[] = [];
    for await (const item of s) {
      results.push(item);
    }

    expect(results).toEqual([1, 2, 3, 4, 5]);
  });

  test('Iterating an already-drained streamie completes immediately', async () => {
    const s = streamie(async (input: number) => input, {});
    s.push(1, 2);
    s.drain();
    await s.promise;

    const results: number[] = [];
    for await (const item of s) {
      results.push(item);
    }

    expect(results).toEqual([]);
  });

  test('Iterating an already-halted streamie rejects with its error', async () => {
    const s = streamie(async () => {
      throw new Error('boom');
    }, {});
    s.push(1);
    s.drain();
    await expect(s.promise).rejects.toBeInstanceOf(StreamieQueueError);
    expect(s.state.isHalted).toBe(true);

    let caught: unknown = null;
    try {
      for await (const _ of s) { /* should never run */ }
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(StreamieQueueError);
  });

  test('Concurrent iterators each observe every item', async () => {
    const s = streamie(async (input: number) => input, {});

    const iterate = async () => {
      const results: number[] = [];
      for await (const item of s) {
        results.push(item);
      }
      return results;
    };

    // Both iterators register before processing begins (same synchronous block as
    // the pushes), so outputs are broadcast to each.
    const promises = [iterate(), iterate()];
    s.push(1, 2, 3);
    s.drain();

    const [a, b] = await Promise.all(promises);
    expect(a).toEqual([1, 2, 3]);
    expect(b).toEqual([1, 2, 3]);
  });
});

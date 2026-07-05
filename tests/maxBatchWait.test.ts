import streamie from '../src';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('Streamie', () => {
  describe('.batch maxBatchWait', () => {
    test('flushes the very first partial batch once maxBatchWait elapses', async () => {
      // Regression: the wait window used to be measured from the last handled
      // invocation, which is null before the first one — so the first partial batch
      // never flushed at all.
      const batches: number[][] = [];
      const head = streamie((n: number) => n, {});
      head.batch(10, { maxBatchWait: 50 }).each((batch) => { batches.push(batch); });

      [1, 2, 3].forEach((n) => head.push(n));

      await wait(25);
      expect(batches).toEqual([]); // Not yet due.
      await wait(75);
      expect(batches).toEqual([[1, 2, 3]]);
    });

    test('an idle gap between batches does not flush the next item as an immediate singleton', async () => {
      // Regression: measured from the last handled batch, an item arriving after an
      // idle gap longer than maxBatchWait was flushed instantly as a batch of one,
      // instead of waiting its own full window for peers.
      const batches: Array<{ batch: number[]; at: number }> = [];
      const start = Date.now();
      const head = streamie((n: number) => n, {});
      head.batch(3, { maxBatchWait: 75 }).each((batch) => { batches.push({ batch, at: Date.now() - start }); });

      // A full batch flushes immediately and establishes a "last handled" time.
      [1, 2, 3].forEach((n) => head.push(n));
      await wait(200); // Idle for well over maxBatchWait.

      const pushedAt = Date.now() - start;
      head.push(4);
      await wait(150);

      expect(batches.map(({ batch }) => batch)).toEqual([[1, 2, 3], [4]]);
      // Item 4's window starts at its own arrival, not at the last batch.
      expect(batches[1].at - pushedAt).toBeGreaterThanOrEqual(50);
    });

    test('items left behind by a full-batch dequeue flush after their own window', async () => {
      const batches: number[][] = [];
      const head = streamie((n: number) => n, {});
      head.batch(3, { maxBatchWait: 50 }).each((batch) => { batches.push(batch); });

      // Five at once: one full batch immediately, a partial remainder on the clock.
      [1, 2, 3, 4, 5].forEach((n) => head.push(n));

      await wait(150);
      expect(batches).toEqual([[1, 2, 3], [4, 5]]);
    });

    test('a drain still flushes a partial batch without waiting out maxBatchWait', async () => {
      const batches: number[][] = [];
      const head = streamie((n: number) => n, {});
      const tail = head.batch(10, { maxBatchWait: 10_000 }).each((batch) => { batches.push(batch); });

      [1, 2].forEach((n) => head.push(n));
      head.drain();
      await tail.promise;

      expect(batches).toEqual([[1, 2]]);
    });

    test('trickling items keeps flushing partial batches on the cadence of the window', async () => {
      const batches: number[][] = [];
      const head = streamie((n: number) => n, {});
      head.batch(5, { maxBatchWait: 60 }).each((batch) => { batches.push(batch); });

      head.push(1);
      await wait(20);
      head.push(2);
      await wait(100); // First window (from item 1's arrival) elapses.
      head.push(3);
      await wait(100); // Second window (from item 3's arrival) elapses.

      expect(batches).toEqual([[1, 2], [3]]);
    });
  });
});

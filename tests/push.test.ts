import streamie from '../src';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// The plain push is receipt-free: nothing is allocated, and the return is the bare
// backpressure boolean (true = backpressured). The tracked variant lives at
// push.withReceipt and has its own suite in pushReceipt.test.ts.
describe('Streamie', () => {
  describe('.push', () => {
    test('items are processed in order', async () => {
      const handled: number[] = [];
      const s = streamie((n: number) => { handled.push(n); return n * 2; }, {});
      const outputs: number[] = [];
      const tail = s.each((n) => { outputs.push(n); });

      [1, 2, 3].forEach((n) => s.push(n));
      s.drain();
      await tail.promise;

      expect(handled).toEqual([1, 2, 3]);
      expect(outputs).toEqual([2, 4, 6]);
    });

    test('returns the input backpressure state the push produced', () => {
      const s = streamie((n: number) => n, { backpressureAt: { input: 2 } });
      // Paused so no dequeue races the assertions: the boolean is a pure function
      // of queue depth vs threshold at the moment of the push.
      s.pause();

      expect(s.push(1)).toBe(false);
      expect(s.push(2)).toBe(true);
      expect(s.push(3)).toBe(true);
      s.abort();
    });

    test('throws on a draining and on a halted streamie', async () => {
      const draining = streamie(async (n: number) => { await wait(10); return n; }, { sink: true });
      draining.push(1);
      draining.drain();
      expect(() => draining.push(2)).toThrow(/Cannot push to a (draining|drained) streamie/);
      await draining.promise;

      const halted = streamie((n: number) => n, {});
      halted.abort();
      expect(() => halted.push(1)).toThrow('Cannot push to a halted streamie.');
      await halted.promise.catch(() => {});
    });

    test('interleaved with push.withReceipt, receipt alignment is preserved', async () => {
      // Plain-pushed items occupy empty receipt slots once tracking is active (and
      // trigger the undefined backfill when a later tracked push activates it), so
      // every receipt must still resolve with its own item's handler return.
      const s = streamie((n: number) => n * 2, { sink: true });

      s.push(1); // Pre-activation: backfilled as an empty slot by the tracked push below.
      const second = s.push.withReceipt(2);
      s.push(3); // Post-activation: occupies an empty slot directly.
      const fourth = s.push.withReceipt(4);
      s.drain();

      await expect(second.promise).resolves.toBe(4);
      await expect(fourth.promise).resolves.toBe(8);
      await s.promise;
    });

    test('is available to handlers as a tool for the self-feeding pattern', async () => {
      const pages: number[] = [];
      const s = streamie((page: number, { push, drain }) => {
        pages.push(page);
        if (page < 3) push(page + 1);
        else drain();
      }, { sink: true });

      s.push(0);
      await s.promise;

      expect(pages).toEqual([0, 1, 2, 3]);
    });

    test('starts a partial batch\'s maxBatchWait window', async () => {
      // Pushed directly into the batch stage: it is the plain push's own stamp that
      // must start the wait window (fed through the head, _receive would stamp it).
      const batches: string[][] = [];
      const head = streamie((s: string) => s, {});
      const batched = head.batch(10, { maxBatchWait: 50 });
      const tail = batched.each((batch) => { batches.push(batch); });

      batched.push('a');
      batched.push('b');

      await wait(25);
      expect(batches).toEqual([]); // Not yet due.
      await wait(75);
      expect(batches).toEqual([['a', 'b']]);

      head.drain();
      await tail.promise;
    });
  });
});

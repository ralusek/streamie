import streamie from '../src';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('Streamie', () => {
  describe('fan-out consumer departure', () => {
    test('a failing consumer does not stall delivery to a healthy sibling', async () => {
      // Regression: delivery stalls while ANY consumer is backpressured; when the
      // backpressured consumer halted, nothing nudged the producer's process loop,
      // so the healthy sibling starved forever and the source never drained.
      const seen: number[] = [];
      const source = streamie((n: number) => n, {});

      const healthy = source.each((n) => { seen.push(n); });
      const failing = source.map(async (n) => {
        await wait(30); // Slow: builds input backpressure at threshold 1.
        throw new Error('consumer failed');
      }, { backpressureAt: { input: 1 } });
      failing.promise.catch(() => {}); // The failure itself is expected.

      for (let i = 0; i < 6; i++) source.push(i);
      source.drain();

      await healthy.promise;
      expect(seen).toEqual([0, 1, 2, 3, 4, 5]);
      expect(source.state.isDrained).toBe(true);
    });

    test('breaking a for await loop does not stall delivery to a healthy sibling', async () => {
      // Regression: the same stall, triggered by an iterator detaching while its
      // one-slot buffer still held an item (so it was the backpressured consumer).
      const seen: number[] = [];
      const source = streamie((n: number) => n, {});

      const healthy = source.each(async (n) => {
        seen.push(n);
        await wait(5);
      });

      const iterated: number[] = [];
      const iterate = (async () => {
        for await (const n of source) {
          iterated.push(n);
          if (iterated.length === 2) break;
        }
      })();

      for (let i = 0; i < 6; i++) source.push(i);
      source.drain();

      await iterate;
      await healthy.promise;
      expect(iterated).toEqual([0, 1]);
      expect(seen).toEqual([0, 1, 2, 3, 4, 5]);
      expect(source.state.isDrained).toBe(true);
    });

    test('a draining (voluntarily departing) consumer does not stall a sibling', async () => {
      const seen: number[] = [];
      const source = streamie((n: number) => n, {});

      const healthy = source.each((n) => { seen.push(n); });
      // Departs after the first item by draining itself — voluntary, like a break.
      const departing = source.map(async (n) => {
        departing.drain();
        return n;
      }, { backpressureAt: { input: 1 } });

      for (let i = 0; i < 4; i++) source.push(i);
      source.drain();

      await healthy.promise;
      expect(seen).toEqual([0, 1, 2, 3]);
    });
  });

  describe('halted queue retention', () => {
    test('an abort releases the abandoned queued items', async () => {
      // Regression: setHalted rejected queued receipts but left the items in the
      // input/output queues, pinning them in memory for as long as the (commonly
      // retained) handle to the halted streamie lived.
      const s = streamie(async (n: number) => {
        await wait(50);
        return n;
      }, {});

      for (let i = 0; i < 20; i++) {
        const receipt = s.push.withReceipt(i);
        receipt.promise.catch(() => {}); // Rejections on halt are expected.
      }
      expect(s.state.count.queued.input).toBeGreaterThan(0);

      s.abort(new Error('halt'));
      await expect(s.promise).rejects.toThrow('halt');

      expect(s.state.count.queued.input).toBe(0);
      expect(s.state.count.queued.output).toBe(0);
    });

    test('outputs settling after a halt are not parked in the output queue', async () => {
      const s = streamie(async (n: number) => {
        await wait(30);
        return n;
      }, {});

      s.push(1); // In flight when the abort lands.
      await wait(5);
      s.abort(new Error('halt'));
      await expect(s.promise).rejects.toThrow('halt');

      await wait(50); // Let the in-flight invocation settle post-halt.
      expect(s.state.count.queued.output).toBe(0);
    });
  });
});

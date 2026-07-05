import streamie, { from } from '../src';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('Streamie', () => {
  describe('.take', () => {
    test('passes through the first n items, then drains itself', async () => {
      const head = streamie((n: number) => n, {});
      const taken = head.take(3);
      const collect = taken.toArray();

      for (let i = 0; i < 10; i++) head.push(i);

      expect(await collect).toEqual([0, 1, 2]);
      expect(taken.state.isDrained).toBe(true);
    });

    test('detaches voluntarily: the producer keeps serving a sibling', async () => {
      const seen: number[] = [];
      const head = streamie((n: number) => n, {});
      const sibling = head.each((n) => { seen.push(n); });
      const taken = head.take(2);
      const collect = taken.toArray();

      for (let i = 0; i < 5; i++) head.push(i);
      head.drain();

      expect(await collect).toEqual([0, 1]);
      await sibling.promise;
      expect(seen).toEqual([0, 1, 2, 3, 4]);
      expect(head.state.isDrained).toBe(true);
    });

    test('an upstream drain before the cutoff still completes take with what arrived', async () => {
      const result = await from([1, 2]).take(5).toArray();
      expect(result).toEqual([1, 2]);
    });

    test('take(0) drains immediately and emits nothing', async () => {
      const head = streamie((n: number) => n, {});
      const taken = head.take(0);
      await taken.promise;
      expect(taken.state.isDrained).toBe(true);
    });

    test('a burst delivery cannot overshoot the cutoff', async () => {
      // Items queued past the cutoff at the moment of the nth emit are discarded.
      const result = await from(Array.from({ length: 100 }, (_, i) => i)).take(7).toArray();
      expect(result).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    test('the receipt resolves with the item whether or not it made the cutoff', async () => {
      const head = streamie((n: number) => n, {});
      const taken = head.take(1);
      taken.each(() => {});

      const first = taken.push.withReceipt(10);
      expect(await first.promise).toBe(10);
      await wait(10);
    });
  });

  describe('.until', () => {
    test('emits items until the predicate matches; the match is excluded by default', async () => {
      const result = await from([1, 3, 5, 8, 9, 11]).until((n) => n % 2 === 0).toArray();
      expect(result).toEqual([1, 3, 5]);
    });

    test('{ inclusive: true } emits the matching item before draining', async () => {
      const result = await from([1, 3, 5, 8, 9, 11]).until((n) => n % 2 === 0, { inclusive: true }).toArray();
      expect(result).toEqual([1, 3, 5, 8]);
    });

    test('supports an async predicate, evaluated in order', async () => {
      const result = await from([1, 2, 3, 4]).until(async (n) => {
        await wait(2);
        return n === 3;
      }).toArray();
      expect(result).toEqual([1, 2]);
    });

    test('a never-matching predicate ends with the source', async () => {
      const result = await from([1, 2, 3]).until(() => false).toArray();
      expect(result).toEqual([1, 2, 3]);
    });

    test('detaches voluntarily: the producer keeps serving a sibling', async () => {
      const seen: number[] = [];
      const head = streamie((n: number) => n, {});
      const sibling = head.each((n) => { seen.push(n); });
      const untilStage = head.until((n) => n >= 2);
      const collect = untilStage.toArray();

      for (let i = 0; i < 5; i++) head.push(i);
      head.drain();

      expect(await collect).toEqual([0, 1]);
      await sibling.promise;
      expect(seen).toEqual([0, 1, 2, 3, 4]);
    });
  });
});

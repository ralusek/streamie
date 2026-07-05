import streamie from '../src';

describe('Streamie', () => {
  describe('.flatMap', () => {
    test('emits each element of the handler\'s returned array individually', async () => {
      const seen: number[] = [];
      const head = streamie((n: number) => n, {});
      const tail = head.flatMap((n) => [n, n * 10]).each((n) => { seen.push(n); });

      [1, 2].forEach((n) => head.push(n));
      head.drain();
      await tail.promise;

      expect(seen).toEqual([1, 10, 2, 20]);
    });

    test('supports async handlers', async () => {
      const seen: string[] = [];
      const head = streamie((s: string) => s, {});
      const tail = head.flatMap(async (s) => s.split('')).each((c) => { seen.push(c); });

      head.push('ab');
      head.drain();
      await tail.promise;

      expect(seen).toEqual(['a', 'b']);
    });

    test('an empty array emits nothing for that input', async () => {
      const seen: number[] = [];
      const head = streamie((n: number) => n, {});
      const tail = head.flatMap((n) => (n % 2 === 0 ? [n] : [])).each((n) => { seen.push(n); });

      [1, 2, 3, 4].forEach((n) => head.push(n));
      head.drain();
      await tail.promise;

      expect(seen).toEqual([2, 4]);
    });

    test('matches .map(...).flatten() output, in one stage', async () => {
      const viaFlatMap: number[] = [];
      const viaComposed: number[] = [];

      const a = streamie((n: number) => n, {});
      const aTail = a.flatMap((n) => [n, n + 1]).each((n) => { viaFlatMap.push(n); });
      const b = streamie((n: number) => n, {});
      const bTail = b.map((n) => [n, n + 1]).flatten().each((n) => { viaComposed.push(n); });

      [1, 5].forEach((n) => { a.push(n); b.push(n); });
      a.drain();
      b.drain();
      await Promise.all([aTail.promise, bTail.promise]);

      expect(viaFlatMap).toEqual(viaComposed);
    });

    test('a non-array return is an ordinary handler error', async () => {
      const head = streamie((n: number) => n, {});
      const tail = head.flatMap((n) => n as unknown as number[]).each(() => {});

      head.push(1);
      head.drain();

      await expect(tail.promise).rejects.toThrow(/must return an array/);
    });

    test('the push receipt resolves with the whole returned array (matching .flatten\'s receipt contract)', async () => {
      const head = streamie((n: number) => n, {});
      const flat = head.flatMap((n) => [n, n * 2]);
      flat.each(() => {});

      // Push directly into the flatMap stage: its receipt resolves with everything
      // the item produced, not any single emitted element.
      const receipt = flat.push.withReceipt(3);
      const value = await receipt.promise;
      expect(value).toEqual([3, 6]);
      head.drain();
    });
  });
});

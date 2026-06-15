import streamie from '../src';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Streamie', () => {
  describe('.produce', () => {
    test('emits a variable number of outputs per input', async () => {
      const seen: string[] = [];
      const head = streamie((n: number) => n, {});

      const tail = head
        .produce<string>((n, { emit }) => {
          for (let i = 0; i < n; i++) emit(`${n}.${i}`);
          return n;
        })
        .each((s) => { seen.push(s); });

      [1, 2, 3].forEach((n) => head.push(n));
      head.drain();
      await tail.promise;

      expect(seen).toEqual(['1.0', '2.0', '2.1', '3.0', '3.1', '3.2']);
    });

    test('emitting zero outputs drops the item', async () => {
      const seen: number[] = [];
      const head = streamie((n: number) => n, {});

      const tail = head
        .produce<number>((n, { emit }) => { if (n % 2 === 0) emit(n); })
        .each((n) => { seen.push(n); });

      [1, 2, 3, 4].forEach((n) => head.push(n));
      head.drain();
      await tail.promise;

      expect(seen).toEqual([2, 4]);
    });

    test('the push receipt resolves with the return value, not the emitted output', async () => {
      const head = streamie((n: number) => n, {});
      const stage = head.produce<string>((n, { emit }) => {
        emit(`emitted-${n}`);
        return `returned-${n}`;
      });
      stage.sink();

      const receipt = stage.push(7);
      stage.drain();
      await stage.promise;

      await expect(receipt.promise).resolves.toBe('returned-7');
    });
  });

  describe('.scan', () => {
    test('emits the running accumulator after each item', async () => {
      const seen: number[] = [];
      const head = streamie((n: number) => n, {});

      const tail = head
        .scan((acc, n) => acc + n, 0)
        .each((sum) => { seen.push(sum); });

      [1, 2, 3, 4].forEach((n) => head.push(n));
      head.drain();
      await tail.promise;

      expect(seen).toEqual([1, 3, 6, 10]);
    });

    test('supports an async reducer (sequentially)', async () => {
      const seen: number[] = [];
      const head = streamie((n: number) => n, {});

      const tail = head
        .scan(async (acc, n) => { await delay(2); return acc + n; }, 0)
        .each((sum) => { seen.push(sum); });

      [1, 2, 3].forEach((n) => head.push(n));
      head.drain();
      await tail.promise;

      expect(seen).toEqual([1, 3, 6]);
    });

    test('emits nothing for an empty stream', async () => {
      const seen: number[] = [];
      const head = streamie((n: number) => n, {});

      const tail = head.scan((acc, n) => acc + n, 0).each((sum) => { seen.push(sum); });

      head.drain();
      await tail.promise;

      expect(seen).toEqual([]);
    });

    test('a push receipt resolves with the accumulator after that item', async () => {
      const head = streamie((n: number) => n, {});
      const scanned = head.scan((acc, n) => acc + n, 0);
      scanned.sink();

      const r1 = scanned.push(10);
      const r2 = scanned.push(5);
      scanned.drain();
      await scanned.promise;

      await expect(r1.promise).resolves.toBe(10);
      await expect(r2.promise).resolves.toBe(15);
    });
  });

  describe('.reduce', () => {
    test('emits a single aggregated value on drain (sync)', async () => {
      const seen: number[] = [];
      const head = streamie((n: number) => n, {});

      const tail = head
        .reduce((acc, n) => acc + n, 0)
        .each((sum) => { seen.push(sum); });

      [1, 2, 3, 4, 5].forEach((n) => head.push(n));
      head.drain();
      await tail.promise;

      expect(seen).toEqual([15]);
    });

    test('emits a single aggregated value on drain (async reducer)', async () => {
      const seen: number[] = [];
      const head = streamie((n: number) => n, {});

      const tail = head
        .reduce(async (acc, n) => { await delay(2); return acc + n; }, 0)
        .each((sum) => { seen.push(sum); });

      [1, 2, 3, 4].forEach((n) => head.push(n));
      head.drain();
      await tail.promise;

      expect(seen).toEqual([10]);
    });

    test('emits the seed for an empty stream', async () => {
      const seen: number[] = [];
      const head = streamie((n: number) => n, {});

      const tail = head.reduce((acc, n) => acc + n, 42).each((sum) => { seen.push(sum); });

      head.drain();
      await tail.promise;

      expect(seen).toEqual([42]);
    });

    test('can build a non-trivial accumulator (grouping)', async () => {
      const head = streamie((n: number) => n, {});
      let result: Record<'even' | 'odd', number[]> = { even: [], odd: [] };

      const tail = head
        .reduce((acc: Record<'even' | 'odd', number[]>, n) => {
          acc[n % 2 === 0 ? 'even' : 'odd'].push(n);
          return acc;
        }, { even: [], odd: [] })
        .each((groups) => { result = groups; });

      [1, 2, 3, 4, 5, 6].forEach((n) => head.push(n));
      head.drain();
      await tail.promise;

      expect(result).toEqual({ even: [2, 4, 6], odd: [1, 3, 5] });
    });

    test('works downstream of a flattened pipeline', async () => {
      const seen: number[] = [];
      const head = streamie((n: number) => n, {});

      const tail = head
        .map((n) => [n, n + 1])
        .flatten()
        .reduce((acc, n) => acc + n, 0)
        .each((sum) => { seen.push(sum); });

      [1, 2, 3].forEach((n) => head.push(n));
      head.drain();
      await tail.promise;

      // 1 -> [1, 2], 2 -> [2, 3], 3 -> [3, 4]; sum of 1+2+2+3+3+4 = 15
      expect(seen).toEqual([15]);
    });

    test('a push receipt resolves with the running accumulator for its item', async () => {
      const head = streamie((n: number) => n, {});
      const reduced = head.reduce((acc, n) => acc + n, 0);
      reduced.sink();

      const r1 = reduced.push(3);
      const r2 = reduced.push(4);
      reduced.drain();
      await reduced.promise;

      await expect(r1.promise).resolves.toBe(3);
      await expect(r2.promise).resolves.toBe(7);
    });
  });
});

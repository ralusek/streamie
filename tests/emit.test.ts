import streamie from '../src';

describe('Streamie', () => {
  describe('decoupled output (automaticallyEmit: false)', () => {
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    test('a handler can emit many outputs per input (fan-out)', async () => {
      const seen: string[] = [];
      const head = streamie((n: number) => n, {});

      const tail = head
        .map<string>((n, { emit }) => {
          for (let i = 0; i < n; i++) emit(`${n}.${i}`);
          return n;
        }, { automaticallyEmit: false })
        .each((s) => { seen.push(s); });

      [1, 2, 3].forEach((n) => head.push(n));
      head.drain();
      await tail.promise;

      expect(seen).toEqual(['1.0', '2.0', '2.1', '3.0', '3.1', '3.2']);
    });

    test('a handler can emit zero outputs (drop)', async () => {
      const seen: number[] = [];
      const head = streamie((n: number) => n, {});

      const tail = head
        .map<number>((n, { emit }) => { if (n % 2 === 0) emit(n); }, { automaticallyEmit: false })
        .each((n) => { seen.push(n); });

      [1, 2, 3, 4].forEach((n) => head.push(n));
      head.drain();
      await tail.promise;

      expect(seen).toEqual([2, 4]);
    });

    test('the push receipt resolves with the return value, not the emitted output', async () => {
      const stage = streamie((n: number, { emit }) => {
        emit(`emitted-${n}`);
        return `returned-${n}`;
      }, { automaticallyEmit: false, sink: true });

      const receipt = stage.push(7);
      stage.drain();
      await stage.promise;

      await expect(receipt.promise).resolves.toBe('returned-7');
    });

    test('an async handler streams its emits as they happen', async () => {
      const seen: number[] = [];
      const head = streamie((n: number) => n, {});

      const tail = head
        .map<number>(async (n, { emit }) => {
          emit(n * 10);
          await delay(5);
          emit(n * 100);
        }, { automaticallyEmit: false })
        .each((n) => { seen.push(n); });

      head.push(1);
      head.drain();
      await tail.promise;

      expect(seen).toEqual([10, 100]);
    });
  });
});

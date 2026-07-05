import streamie from '../src';

describe('Streamie', () => {
  describe('config validation', () => {
    describe('concurrency', () => {
      test('rejects zero, negative, and fractional values', () => {
        // Regression: a negative concurrency used to be accepted and silently
        // deadlock the stage (handling >= concurrency was always true).
        expect(() => streamie((n: number) => n, { concurrency: 0 })).toThrow(/concurrency/);
        expect(() => streamie((n: number) => n, { concurrency: -2 })).toThrow(/concurrency/);
        expect(() => streamie((n: number) => n, { concurrency: 1.5 })).toThrow(/concurrency/);
      });

      test('accepts Infinity as "no cap"', async () => {
        const handled: number[] = [];
        const s = streamie((n: number) => { handled.push(n); return n; }, { concurrency: Infinity, sink: true });
        [1, 2, 3].forEach((n) => s.push(n));
        s.drain();
        await s.promise;
        expect(handled).toEqual([1, 2, 3]);
      });

      test('rejects invalid concurrency on chained stages too', () => {
        const head = streamie((n: number) => n, {});
        expect(() => head.map((n) => n, { concurrency: -1 })).toThrow(/concurrency/);
      });
    });

    describe('maxBatchWait', () => {
      test('rejects zero and negative values', () => {
        // Regression: an explicit 0 used to be coerced by `|| Infinity` into "wait
        // forever" — the opposite of what was asked.
        const head = streamie((n: number) => n, {});
        expect(() => head.batch(5, { maxBatchWait: 0 })).toThrow(/maxBatchWait/);
        expect(() => head.batch(5, { maxBatchWait: -50 })).toThrow(/maxBatchWait/);
        expect(() => head.batch(5, { maxBatchWait: NaN })).toThrow(/maxBatchWait/);
      });
    });

    describe('retry', () => {
      test('rejects negative and fractional attempts', () => {
        expect(() => streamie((n: number) => n, { retry: -1 })).toThrow(/retry/);
        expect(() => streamie((n: number) => n, { retry: { attempts: 1.5 } })).toThrow(/retry/);
        expect(() => streamie((n: number) => n, { retry: { attempts: 2, delay: -5 } })).toThrow(/retry/);
      });

      test('accepts 0 as "no retries"', () => {
        expect(() => streamie((n: number) => n, { retry: 0 })).not.toThrow();
      });
    });

    describe('timeout', () => {
      test('rejects zero and negative values', () => {
        expect(() => streamie((n: number) => n, { timeout: 0 })).toThrow(/timeout/);
        expect(() => streamie((n: number) => n, { timeout: -100 })).toThrow(/timeout/);
      });

      test('accepts Infinity as "no timeout"', () => {
        expect(() => streamie((n: number) => n, { timeout: Infinity })).not.toThrow();
      });
    });

    describe('take', () => {
      test('rejects negative and fractional counts', () => {
        const head = streamie((n: number) => n, {});
        expect(() => head.take(-1)).toThrow(/take/);
        expect(() => head.take(1.5)).toThrow(/take/);
      });
    });
  });
});

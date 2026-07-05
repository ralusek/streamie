import streamie from '../src';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('Streamie', () => {
  describe('seed', () => {
    test('a seed is pushed and processed', async () => {
      const handled: number[] = [];
      const s = streamie((n: number) => {
        handled.push(n);
        if (n < 2) s.push(n + 1);
        else s.drain();
        return n;
      }, { seed: 0, sink: true });

      await s.promise;
      expect(handled).toEqual([0, 1, 2]);
    });

    test('aborting in the same tick as construction does not crash on the deferred seed push', async () => {
      // Regression: the deferred seed push only checked isDrained, so a
      // synchronous abort() made it throw inside the timer callback — an uncaught
      // exception taking down the process.
      const s = streamie(async (n: number) => n, { seed: 0 });
      s.abort(new Error('changed my mind'));

      await expect(s.promise).rejects.toThrow('changed my mind');
      // Survive past the seed timer; an uncaught throw here would fail the suite.
      await wait(20);
    });

    test('a synchronous push + drain in the construction tick skips the seed without crashing', async () => {
      // Regression: shouldDrain (with an item still queued, so not yet isDrained)
      // also made the deferred seed push throw.
      const handled: number[] = [];
      const s = streamie(async (n: number) => { handled.push(n); return n; }, { seed: 99, sink: true });
      s.push(1);
      s.drain();

      await s.promise;
      await wait(20);
      // The explicitly pushed item was handled; the seed, arriving after the drain
      // began, is moot rather than an error.
      expect(handled).toEqual([1]);
    });
  });
});

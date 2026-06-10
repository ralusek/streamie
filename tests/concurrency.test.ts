import streamie from '../src';

describe('Streamie', () => {
  describe('concurrency', () => {
    test('concurrency is limited correctly', async () => {
      // Currently executing task ids.
      const active: number[] = [];
      // The most tasks ever observed in flight at once.
      let maxActive = 0;

      // Task durations: task 1 → 200ms, task 2 → 400ms, tasks 3-5 → 600ms.
      // With a concurrency of 3, the expected timeline is:
      //   t=0     tasks 1, 2, 3 start
      //   t=200   task 1 ends, task 4 starts (will end at t=800)
      //   t=400   task 2 ends, task 5 starts (will end at t=1000)
      //   t=600   task 3 ends
      //   t=800   task 4 ends
      //   t=1000  task 5 ends
      // Events are spaced 200ms apart and checkpoints sit at the midpoints between
      // them, so every expectation has a ±100ms window in which it is valid.
      const concurrencyStreamie = streamie(async (timeout: number, { index }) => {
        const id = index + 1;
        active.push(id);
        maxActive = Math.max(maxActive, active.length);
        await new Promise(resolve => setTimeout(resolve, timeout));
        active.splice(active.indexOf(id), 1); // Remove the task from the queue.
      }, { concurrency: 3 });

      const t0 = Date.now();

      // Push items into the streamie input queue.
      for (let i = 1; i <= 5; i++) {
        concurrencyStreamie.push(Math.min(i * 200, 600));
      }

      // Sleeps until the given number of milliseconds has elapsed since t0. Scheduling
      // against absolute elapsed time, rather than chaining relative setTimeouts, keeps
      // timer drift from accumulating across checkpoints: under load (e.g. parallel
      // jest workers pausing for GC) each relative timeout fires a little late, and the
      // accumulated drift can push a checkpoint into the next event's window.
      const waitUntilElapsed = async (target: number) => {
        let remaining: number;
        while ((remaining = target - (Date.now() - t0)) > 0) {
          await new Promise(resolve => setTimeout(resolve, remaining));
        }
      };

      // Asserts which tasks are in flight at a nominal checkpoint time, but only if the
      // observation is actually being made within the checkpoint's ±100ms validity
      // window. If the event loop was blocked long enough to push us outside it, the
      // snapshot is meaningless and asserting it would be a false failure — the
      // concurrency invariants themselves are asserted unconditionally at the end.
      const expectActiveAt = (nominal: number, expected: number[]) => {
        const elapsed = Date.now() - t0;
        if (Math.abs(elapsed - nominal) >= 100) {
          console.warn(`Skipping snapshot for t=${nominal}ms: observed at ${elapsed}ms, outside the valid window.`);
          return;
        }
        expect(active).toEqual(expected);
      };

      await waitUntilElapsed(100);
      expectActiveAt(100, [1, 2, 3]);

      await waitUntilElapsed(300);
      expectActiveAt(300, [2, 3, 4]);

      await waitUntilElapsed(500);
      expectActiveAt(500, [3, 4, 5]);

      await waitUntilElapsed(700);
      expectActiveAt(700, [4, 5]);

      await waitUntilElapsed(900);
      expectActiveAt(900, [5]);

      await waitUntilElapsed(1100);
      expectActiveAt(1100, []);

      // Load-independent invariants: the concurrency limit was saturated but never
      // exceeded, and every task ran to completion.
      expect(maxActive).toBe(3);
      expect(concurrencyStreamie.state.count.started).toBe(5);
      expect(active).toEqual([]);

      expect(concurrencyStreamie.state.isDrained).toBe(false);

      concurrencyStreamie.drain();
      await concurrencyStreamie.promise;

      expect(concurrencyStreamie.state.isDrained).toBe(true);
    });
  });
});

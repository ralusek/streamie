import streamie from '../src';

describe('Streamie', () => {
  describe('concurrency', () => {
    test('concurrency is limited correctly', async () => {
      // Queue to hold currently executing tasks.
      const active: number[] = [];

      // Create a streamie with the task function and a concurrency limit of 3.
      const concurrencyStreamie = streamie(async (timeout: number, { index }) => {
        const id = index + 1;
        active.push(id);
        await new Promise(resolve => setTimeout(resolve, timeout));
        active.splice(active.indexOf(id), 1); // Remove the task from the queue.
      }, { concurrency: 3 });

      // Push items into the streamie input queue.
      for (let i = 1; i <= 5; i++) {
        // The timeouts for the first 3 are staggered because they should be executing concurrently.
        // Everything after that will actually be queued up, so they can all have 300ms and be naturally staggered.
        concurrencyStreamie.push(Math.min(i * 100, 300));
      }

      // 50 MS in
      // At 50 ms, the first 3 should be underway but the 4th should not have started.
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(active.length).toBe(3);
      expect(active).toEqual([1, 2, 3]);

      // 150 MS in (50ms + 100ms)
      // At 150ms the first task, taking 100ms, should have completed, and the 4th should have started.
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(active.length).toBe(3);
      expect(active).toEqual([2, 3, 4]);

      // 250 MS in (150ms + 100ms)
      // At 250ms the second task, taking 200ms, should have completed, and the 5th should have started.
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(active.length).toBe(3);
      expect(active).toEqual([3, 4, 5]);

      // 350 MS in (250ms + 100ms)
      // At 350ms the third task, taking 300ms, should have completed, and we'll be down to only 2 executing.
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(active.length).toBe(2);
      expect(active).toEqual([4, 5]);

      // 450 MS in (350ms + 100ms)
      // At 450ms the fourth task, taking 400ms, should have completed, and we'll be down to only 1 executing.
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(active.length).toBe(1);
      expect(active).toEqual([5]);

      // 550 MS in (450ms + 100ms)
      // At 550ms the fifth task, taking 500ms, should have completed, and we'll be down to 0 executing.
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(active.length).toBe(0);
      expect(active).toEqual([]);

      expect(concurrencyStreamie.state.isDrained).toBe(false);

      concurrencyStreamie.drain();
      await concurrencyStreamie.promise;

      expect(concurrencyStreamie.state.isDrained).toBe(true);
    });
  });
});

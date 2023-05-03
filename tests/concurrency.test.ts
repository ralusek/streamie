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
        // Everything after that will actually be queued up, so they can all have 150ms and be naturally staggered.
        concurrencyStreamie.push(Math.min(i * 50, 150));
      }

      // 25 MS in
      // At 25 ms, the first 3 should be underway but the 4th should not have started.
      await new Promise(resolve => setTimeout(resolve, 25));
      expect(active.length).toBe(3);
      expect(active).toEqual([1, 2, 3]);

      // 75 MS in (25ms + 50ms)
      // At 75ms the first task, taking 50ms, should have completed, and the 4th should have started.
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(active.length).toBe(3);
      expect(active).toEqual([2, 3, 4]);

      // 125 MS in (75ms + 50ms)
      // At 125ms the second task, taking 100ms, should have completed, and the 5th should have started.
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(active.length).toBe(3);
      expect(active).toEqual([3, 4, 5]);

      // 175 MS in (125ms + 50ms)
      // At 175ms the third task, taking 150ms, should have completed, and we'll be down to only 2 executing.
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(active.length).toBe(2);
      expect(active).toEqual([4, 5]);

      // 225 MS in (175ms + 50ms)
      // At 225ms the fourth task, taking 200ms, should have completed, and we'll be down to only 1 executing.
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(active.length).toBe(1);
      expect(active).toEqual([5]);

      // 275 MS in (225ms + 50ms)
      // At 275ms the fifth task, taking 250ms, should have completed, and we'll be down to 0 executing.
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

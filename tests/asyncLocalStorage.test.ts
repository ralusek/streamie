import { AsyncLocalStorage } from 'async_hooks';

import streamie from '../src';

// Streamies are queue-based, so AsyncLocalStorage context does not flow "with" each
// item automatically — it flows with the async execution that schedules and runs the
// processing loop. What the library guarantees today:
//
//   1. A pipeline created and fed within an als.run() runs all of its handlers — across
//      every stage type, sync or async — inside that context.
//   2. A handler's own awaits never lose the context.
//   3. Handler-driven feeding (tools.push / seed, i.e. the paginator pattern) stays in
//      the originating context.
//
// What it does NOT guarantee today (encoded as test.failing at the bottom): per-item
// context when multiple different contexts push into one shared streamie. Items are
// processed in whatever context first triggered the processing loop, so the second
// pusher's items run under the first pusher's store. Fixing that would require
// capturing the context per push and threading it through the input queue, handler
// invocation, output queue, and inter-streamie delivery — a hot-path cost that needs
// benchmarking before it lands.

describe('Streamie', () => {
  describe('AsyncLocalStorage', () => {
    test('handlers in every stage type observe the context the pipeline was created and fed in', async () => {
      const als = new AsyncLocalStorage<{ requestId: string }>();
      const observed: Record<string, (string | undefined)[]> = {
        map: [],
        filter: [],
        afterBatch: [],
        afterFlatten: [],
      };
      const requestId = () => als.getStore()?.requestId;

      await als.run({ requestId: 'request-1' }, async () => {
        const source = streamie(async (x: number) => {
          observed.map.push(requestId());
          return [x, x * 10];
        }, {});

        const tail = source
          .flatten()
          .filter((x) => {
            observed.afterFlatten.push(requestId());
            return x >= 10;
          })
          .batch(2)
          .map(async (pair) => {
            observed.afterBatch.push(requestId());
            return pair[0] + pair[1];
          })
          .filter(async () => {
            observed.filter.push(requestId());
            return true;
          })
          .sink();

        [1, 2, 3, 4].forEach((item) => source.push(item));
        source.drain();
        await tail.promise;
      });

      expect(observed.map).toEqual(Array(4).fill('request-1'));
      expect(observed.afterFlatten).toEqual(Array(8).fill('request-1'));
      expect(observed.afterBatch).toEqual(Array(2).fill('request-1'));
      expect(observed.filter).toEqual(Array(2).fill('request-1'));
    });

    test('context is maintained across awaits within a handler, including under concurrency', async () => {
      const als = new AsyncLocalStorage<{ requestId: string }>();
      const observed: { item: number, before: string | undefined, after: string | undefined }[] = [];

      await als.run({ requestId: 'request-2' }, async () => {
        const s = streamie(async (x: number) => {
          const before = als.getStore()?.requestId;
          // Stagger the timeouts so the three in-flight handlers resume interleaved
          // with each other rather than in the order they started.
          await new Promise(resolve => setTimeout(resolve, (4 - x) * 10));
          observed.push({ item: x, before, after: als.getStore()?.requestId });
        }, { concurrency: 3, sink: true });

        [1, 2, 3].forEach((item) => s.push(item));
        s.drain();
        await s.promise;
      });

      expect(observed).toHaveLength(3);
      for (const { before, after } of observed) {
        expect(before).toBe('request-2');
        expect(after).toBe('request-2');
      }
    });

    test('handler-driven pushes (seed/paginator pattern) stay in the originating context', async () => {
      const als = new AsyncLocalStorage<{ requestId: string }>();
      const observed: (string | undefined)[] = [];

      await als.run({ requestId: 'request-3' }, async () => {
        const paginator = streamie(async (page: number, { push, drain }) => {
          observed.push(als.getStore()?.requestId);
          if (page < 2) push(page + 1);
          else drain();
          return page;
        }, { seed: 0, sink: true });

        await paginator.promise;
      });

      expect(observed).toEqual(Array(3).fill('request-3'));
    });

    // KNOWN LIMITATION: per-item context for a shared streamie fed from multiple
    // contexts. Today both items below observe 'pusher-1', because item2 is processed
    // by a continuation of the loop that item1's push started. If this test starts
    // failing (i.e. jest reports it as unexpectedly passing), per-item propagation has
    // been implemented and it should be converted to a regular test.
    test.failing('items pushed from different contexts each observe their own pusher\'s context', async () => {
      const als = new AsyncLocalStorage<{ requestId: string }>();
      const observed: { item: string, requestId: string | undefined }[] = [];

      const s = streamie(async (item: string) => {
        observed.push({ item, requestId: als.getStore()?.requestId });
        await new Promise(resolve => setTimeout(resolve, 10));
      }, { concurrency: 1, sink: true });

      als.run({ requestId: 'pusher-1' }, () => s.push('item1'));
      als.run({ requestId: 'pusher-2' }, () => s.push('item2'));
      s.drain();
      await s.promise;

      expect(observed).toEqual([
        { item: 'item1', requestId: 'pusher-1' },
        { item: 'item2', requestId: 'pusher-2' },
      ]);
    });
  });
});

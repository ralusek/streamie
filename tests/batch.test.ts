import streamie from '../src';

describe('Streamie', () => {
  describe('.batch', () => {
    test('still emits batches when a caller passes automaticallyEmit: false (it is forced on)', async () => {
      const seen: number[][] = [];
      const head = streamie((n: number) => n, {});

      // A stray { automaticallyEmit: false } must not turn a batch stage into a void.
      const tail = head
        .batch(2, { automaticallyEmit: false } as never)
        .each((batch) => { seen.push(batch); });

      [1, 2, 3, 4].forEach((n) => head.push(n));
      head.drain();
      await tail.promise;

      expect(seen).toEqual([[1, 2], [3, 4]]);
    });
  });
});

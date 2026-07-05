import streamie, { from } from '../src';

describe('Streamie', () => {
  describe('.toArray', () => {
    test('collects every output in delivery order and resolves on drain', async () => {
      const head = streamie((n: number) => n * 2, {});
      const collect = head.toArray();

      [1, 2, 3].forEach((n) => head.push(n));
      head.drain();

      expect(await collect).toEqual([2, 4, 6]);
    });

    test('collects through a chain', async () => {
      const result = await from([1, 2, 3, 4])
        .filter((n) => n % 2 === 0)
        .map((n) => n * 10)
        .toArray();
      expect(result).toEqual([20, 40]);
    });

    test('receives retained backlog from a previously consumer-less streamie', async () => {
      const head = streamie((n: number) => n, {});
      [1, 2].forEach((n) => head.push(n));
      head.drain();
      // No consumer was attached at push time; outputs are retained.
      await new Promise<void>((resolve) => setTimeout(resolve, 20));

      expect(await head.toArray()).toEqual([1, 2]);
    });

    test('rejects when the streamie errors', async () => {
      const head = streamie((n: number) => {
        if (n === 2) throw new Error('handler failed');
        return n;
      }, {});
      const collect = head.toArray();

      [1, 2].forEach((n) => head.push(n));

      await expect(collect).rejects.toThrow();
    });

    test('rejects when the streamie is aborted', async () => {
      const head = streamie(async (n: number) => n, {});
      const collect = head.toArray();
      head.abort(new Error('cancelled'));

      await expect(collect).rejects.toThrow('cancelled');
    });

    test('two concurrent toArray calls each receive every item (broadcast)', async () => {
      const head = streamie((n: number) => n, {});
      const a = head.toArray();
      const b = head.toArray();

      [1, 2, 3].forEach((n) => head.push(n));
      head.drain();

      expect(await a).toEqual([1, 2, 3]);
      expect(await b).toEqual([1, 2, 3]);
    });
  });
});

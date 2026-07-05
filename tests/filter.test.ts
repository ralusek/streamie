import streamie from '../src';

describe('Streamie', () => {
  describe('filter function', () => {
    // Test the filter function
    test('filter function', async () => {
      let filteredStreamieWasDrained = false;
      const initialStreamie = streamie(async (input: number) => input * 3, {});

      const result: number[] = [];
      const filteredStreamie = initialStreamie.filter((output) => output % 2 === 0, {})
      .each((value) => result.push(value), {});
      filteredStreamie.onDrained(() => {
        filteredStreamieWasDrained = true;
        expect(result).toEqual([6, 12]);
      });

      [1, 2, 3, 4].forEach((item) => initialStreamie.push(item));
      initialStreamie.drain();
      await filteredStreamie.promise;
      expect(filteredStreamieWasDrained).toBe(true);
    });

    // Test the filter function on batched items
    test('filter function on batched items', async () => {
      let filteredStreamieWasDrained = false;
      const initialStreamie = streamie(async (input: number) => input * 3, {});

      const result: number[][] = [];
      const filteredStreamie = initialStreamie
      .batch(3)
      .filter((outputs) => {
        return outputs.every(output => output % 2 === 0);
      }, {})
      .each((values) => {
        result.push(values);
      }, {});
      filteredStreamie.onDrained(() => {
        filteredStreamieWasDrained = true;
        expect(result).toEqual([
          [6, 12, 18],
          [36],
        ]);
      });

      [2, 4, 6, 7, 9, 11, 12].forEach((item) => initialStreamie.push(item));
      initialStreamie.drain();
      expect(filteredStreamieWasDrained).toBe(false);
      await filteredStreamie.promise;
      expect(filteredStreamieWasDrained).toBe(true);
    });
  });
});

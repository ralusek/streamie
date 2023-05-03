import streamie from '../src';

describe('Streamie', () => {
  describe('filter function', () => {
    // Test the filter function
    test('filter function', async () => {
      let filteredStreamieWasDrained = false;
      const initialStreamie = streamie(async (input: number) => input * 3, {});

      const result: number[] = [];
      const filteredStreamie = initialStreamie.filter((output) => output % 2 === 0, {})
      .map((value) => result.push(value), {});
      filteredStreamie.onDrained(() => {
        filteredStreamieWasDrained = true;
        expect(result).toEqual([6, 12]);
      });

      initialStreamie.push(1, 2, 3, 4);
      initialStreamie.drain();
      await filteredStreamie.promise;
      expect(filteredStreamieWasDrained).toBe(true);
    });

    // Test the filter function with batchSize > 1
    test('filter function with batchSize > 1', async () => {
      let filteredStreamieWasDrained = false;
      const initialStreamie = streamie(async (input: number) => input * 3, {});

      const result: number[][] = [];
      const filteredStreamie = initialStreamie.filter((outputs) => {
        return outputs.every(output => output % 2 === 0);
      }, { batchSize: 3 })
      .map((values) => {
        result.push(values);
      }, {});
      filteredStreamie.onDrained(() => {
        filteredStreamieWasDrained = true;
        expect(result).toEqual([
          [6, 12, 18],
          [36],
        ]);
      });

      initialStreamie.push(2, 4, 6, 7, 9, 11, 12);
      initialStreamie.drain();
      expect(filteredStreamieWasDrained).toBe(false);
      await filteredStreamie.promise;
      expect(filteredStreamieWasDrained).toBe(true);
    });
  });
});
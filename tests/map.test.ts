import streamie from '../src';

describe('Streamie', () => {
  describe('map function', () => {
    // Test the map function
    test('map function', async () => {
      let mappedStreamieWasDrained = false;
      const initialStreamie = streamie(async (input: number) => input * 2, {});

      const result: number[] = [];
      const mappedStreamie = initialStreamie.map((output) => result.push(output + 1), {});
      mappedStreamie.onDrained(() => {
        mappedStreamieWasDrained = true;
        expect(result).toEqual([3, 5, 7]);
      });

      initialStreamie.push(1, 2, 3);
      initialStreamie.drain();
      await mappedStreamie.promise;
      expect(mappedStreamieWasDrained).toBe(true);
    });

    // Test the map function downstream of a batch combinator
    test('map function on batched stages', async () => {
      let mappedStreamieWasDrained = false;
      const initialStreamie = streamie((input: number) => input, {});

      const doubledBatches = initialStreamie
      .batch(2)
      .map((inputs) => inputs.map(input => input * 2), {});

      const expectationsByBatch = [
        [2, 4],
        [6, 8],
      ];
      const result: number[] = [];
      const mappedStreamie = doubledBatches
      .batch(2)
      .map((outputs) => {
        outputs.forEach((pair, index) => {
          const expectation = expectationsByBatch[index];
          expect(pair).toEqual(expectation);
        });
        result.push(...outputs.flat().map(output => output + 1));
      }, {});
      mappedStreamie.onDrained(() => {
        mappedStreamieWasDrained = true;
        expect(result).toEqual([3, 5, 7, 9]);
      });

      initialStreamie.push(1, 2, 3, 4);
      initialStreamie.drain();
      await mappedStreamie.promise;
      expect(mappedStreamieWasDrained).toBe(true);
    });

    test('map function with batch and flatten combinators', async () => {
      let mappedStreamieWasDrained = false;
      const initialStreamie = streamie((input: number) => input, {});

      const doubled = initialStreamie
      .batch(2)
      .map((inputs) => inputs.map(input => input * 2), {})
      .flatten();

      const expectationsByBatch = [
        [2, 4, 6],
        [8],
      ];
      const result: number[] = [];
      let i = 0;
      const mappedStreamie = doubled
      .batch(3)
      .map((outputs) => {
        const expectation = expectationsByBatch[i++];
        expect(outputs).toEqual(expectation);
        result.push(...outputs.map(output => output + 1));
      }, {});

      mappedStreamie.onDrained(() => {
        mappedStreamieWasDrained = true;
        expect(result).toEqual([3, 5, 7, 9]);
      });

      initialStreamie.push(1, 2, 3, 4);
      initialStreamie.drain();
      await mappedStreamie.promise;
      expect(mappedStreamieWasDrained).toBe(true);
    });

      // Test it all together
    test('a combination of filter and batch and flatten', async () => {
      let filteredStreamieWasDrained = false;
      let finalStreamieWasDrained = false;
      const initialStreamie = streamie((input: number) => input, {});

      const result: number[] = [];
      const filteredStreamie = initialStreamie.filter((output) => {
        return output % 2 === 0;
      }, {})
      .batch(2)
      .filter((pair) => {
        return pair[1] > 4;
      }, {})
      .flatten()
      .map((output) => {
        return output * 2;
      }, {});

      const final = filteredStreamie.map((final) => {
        result.push(final);
      }, {});

      filteredStreamie.onDrained(() => {
        filteredStreamieWasDrained = true;
        expect(result).toEqual([12, 16]);
      });

      final.onDrained(() => {
        finalStreamieWasDrained = true;
      });

      initialStreamie.push(1, 2, 3, 4, 5, 6, 7, 8);
      initialStreamie.drain();
      await filteredStreamie.promise;
      expect(filteredStreamieWasDrained).toBe(true);
      expect(finalStreamieWasDrained).toBe(true);
      await final.promise;
      expect(finalStreamieWasDrained).toBe(true);
    });
  });
});

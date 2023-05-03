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

    // Test the map function with batchSize > 1
    test('map function with batchSize > 1', async () => {
      let mappedStreamieWasDrained = false;
      const initialStreamie = streamie<number, number[], { batchSize: 2}>(
        (inputs: number[]) => inputs.map(input => input * 2),
        { batchSize: 2 }
      );
      
      const expectationsByBatch = [
        [2, 4],
        [6, 8],
      ];
      const result: number[] = [];
      const mappedStreamie = initialStreamie.map((outputs: number[][]) => {
        outputs.forEach((pair, index) => {
          const expectation = expectationsByBatch[index];
          expect(pair).toEqual(expectation);
        });
        result.push(...outputs.flat().map(output => output + 1));
      }, { batchSize: 2});
      mappedStreamie.onDrained(() => {
        mappedStreamieWasDrained = true;
        expect(result).toEqual([3, 5, 7, 9]);
      });

      initialStreamie.push(1, 2, 3, 4);
      initialStreamie.drain();
      await mappedStreamie.promise;
      expect(mappedStreamieWasDrained).toBe(true);
    });

    test('map function with batchSize > 1 and flatten: true', async () => {
      let mappedStreamieWasDrained = false;
      const initialStreamie = streamie((inputs: number[]) => inputs.map(input => input * 2), { batchSize: 2, flatten: true });
      
      const expectationsByBatch = [
        [2, 4, 6],
        [8],
      ];
      const result: number[] = [];
      let i = 0;
      const mappedStreamie = initialStreamie.map(
        // @ts-ignore
      (outputs: number[]) => {
        const expectation = expectationsByBatch[i++];
        expect(outputs).toEqual(expectation);
        result.push(...outputs.map(output => output + 1));
      }, { batchSize: 3});

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
    test('a combination of filter and batch size and flatten', async () => {
      let filteredStreamieWasDrained = false;
      let finalStreamieWasDrained = false;
      const initialStreamie = streamie((input: number) => input, {});

      const result: number[] = [];
      const filteredStreamie = initialStreamie.filter((output) => {
        return output % 2 === 0;
      }, {})
      .map((output) => {
        return output[1] > 4;
      }, { isFilter: true, batchSize: 2 })
      .map((output) => {
        return output;
      }, { flatten: true })
      .map((output) => {
        return output * 2;
      }, {})
      
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
      expect(finalStreamieWasDrained).toBe(false);
      await final.promise;
      expect(finalStreamieWasDrained).toBe(true);
    });
  });
});
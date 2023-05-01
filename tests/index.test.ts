import streamie from '../src';

describe('Streamie', () => {
  // Test the map function
  test('map function', async () => {
    let mappedStreamieWasDrained = false;
    const initialStreamie = streamie(([input]: number[]) => input * 2, {});

    const result: number[] = [];
    const mappedStreamie = initialStreamie.map(([output]: number[]) => result.push(output + 1), {});
    mappedStreamie.onDrained(() => {
      mappedStreamieWasDrained = true;
      expect(result).toEqual([3, 5, 7]);
    });

    initialStreamie.push(1, 2, 3);
    initialStreamie.drain();
    await mappedStreamie.promise;
    expect(mappedStreamieWasDrained).toBe(true);
  });

  // Test the filter function
  test('filter function', async () => {
    let filteredStreamieWasDrained = false;
    const initialStreamie = streamie(([input]: number[]) => input, {});

    const result: number[] = [];
    const filteredStreamie = initialStreamie.filter(([output]: number[]) => {
      const keep = output % 2 === 0;
      if (keep) {
        result.push(output);
      }
      return keep;
    }, {});
    filteredStreamie.onDrained(() => {
      filteredStreamieWasDrained = true;
      expect(result).toEqual([2, 4]);
    });

    initialStreamie.push(1, 2, 3, 4);
    initialStreamie.drain();
    await filteredStreamie.promise;
    expect(filteredStreamieWasDrained).toBe(true);
  });

  // Test the map function with batchSize > 1
  test('map function with batchSize > 1', async () => {
    let mappedStreamieWasDrained = false;
    const initialStreamie = streamie((inputs: number[]) => inputs.map(input => input * 2), { batchSize: 2 });
    
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

  // // Test the filter function with batchSize > 1
  // test('filter function with batchSize > 1', async () => {
  //   let filteredStreamieWasDrained = false;
  //   const initialStreamie = streamie((inputs: number[]) => inputs, { batchSize: 2 });

  //   const result: number[] = [];
  //   const filteredStreamie = initialStreamie.filter((outputs: number[]) => {
  //     const keep = outputs.filter(output => output % 2 === 0);
  //     result.push(...keep);
  //     return keep;
  //   }, {});
  //   filteredStreamie.onDrained(() => {
  //     filteredStreamieWasDrained = true;
  //     expect(result).toEqual([2, 4]);
  //   });

  //   initialStreamie.push(1, 2, 3, 4);
  //   initialStreamie.drain();
  //   await filteredStreamie.promise;
  //   expect(filteredStreamieWasDrained).toBe(true);
  // });
});
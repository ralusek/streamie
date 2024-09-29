import streamie from '../src';

describe('Handles drains as expected', () => {
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  test('Handles multiple outputs correctly', async () => {
    const results = {
      A: [] as number[],
      B: [] as number[],
      C: [] as number[],
    };

    const streamA = streamie(async (input: number) => input * 1, {});
    const streamB = streamie(async (input: number) => {
      results.A.push(input);
      return input * 2;
    }, {});
    const streamC = streamie(async (input: number) => {
      results.B.push(input);
      await delay(1000);
      return input * 3;
    }, {})
    
    const map = streamC.map((output) => results.C.push(output), {});

    streamA.registerOutput(streamB);
    streamB.registerOutput(streamC);

    streamA.push(1, 2, 3, 4);

    streamA.drain();
    await streamA.promise;
    expect(streamA.state.isDrained).toBe(true);
    expect(streamB.state.isDrained).toBe(true); // This is drained because its behavior was synchronous
    expect(streamC.state.isDrained).toBe(false);
    expect(results.A).toEqual([1, 2, 3, 4]);

    await streamB.promise;
    expect(streamA.state.isDrained).toBe(true);
    expect(streamB.state.isDrained).toBe(true); // This is drained because its behavior was synchronous
    expect(streamC.state.isDrained).toBe(false);

    await streamC.promise;
    expect(results.B).toEqual([2, 4, 6, 8]);
    expect(streamA.state.isDrained).toBe(true);
    expect(streamB.state.isDrained).toBe(true);
    expect(streamC.state.isDrained).toBe(true); // Finally resolved, as expected, only once its promise is awaited

    await map.promise;
    expect(results.C).toEqual([6, 12, 18, 24]);
  });

});

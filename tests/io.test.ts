import streamie from '../src';

describe('Multiple Inputs and Outputs', () => {
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  test('Handles multiple inputs correctly', async () => {
    const streamA1 = streamie(async (input: number) => input * 2, {});
    const streamA2 = streamie(async (input: number) => input * 3, {});
    const streamB = streamie(async (input: number) => input + 1, {});
    streamB.registerInput(streamA1);
    streamB.registerInput(streamA2);

    const result: number[] = [];
    const finalStreamie = streamB.map((output) => result.push(output), {});
    
    streamA1.push(1, 2);
    streamA2.push(3, 4);
    expect(streamA1.state.isDrained).toBe(false);
    expect(streamA2.state.isDrained).toBe(false);
    expect(streamB.state.isDrained).toBe(false);

    streamA1.drain();
    await streamA1.promise;
    expect(streamA1.state.isDrained).toBe(true);
    expect(streamA2.state.isDrained).toBe(false);
    expect(streamB.state.isDrained).toBe(false);

    streamA2.drain();
    await streamB.promise;
    expect(streamA1.state.isDrained).toBe(true);
    expect(streamA2.state.isDrained).toBe(true);
    expect(streamB.state.isDrained).toBe(true);

    await finalStreamie.promise;

    // // Verify that streamB correctly receives the data from streamA1 and streamA2
    expect(result.sort((a, b) => a - b)).toEqual([3, 5, 10, 13]);
  });

  test('Handles multiple outputs correctly', async () => {
    const streamB = streamie(async (input: number) => input * 2, {});
    const streamC1 = streamie(async (input: number) => input * 2, {});
    const streamC2 = streamie<number, number, {}>(async (input: number) => delay(200).then(() => input * 3), {});
    streamB.registerOutput(streamC1);
    streamB.registerOutput(streamC2);

    let result1: number[] = [];
    let result2: number[] = [];
    const finalStreamie1 = streamC1.map((output) => result1.push(output), {});
    const finalStreamie2 = streamC2.map((output) => result2.push(output), {});

    streamB.push(1, 2, 3, 4);
    expect(streamB.state.isDrained).toBe(false);
    expect(streamC1.state.isDrained).toBe(false);
    expect(streamC2.state.isDrained).toBe(false);

    streamB.drain();
    await streamB.promise;
    expect(streamB.state.isDrained).toBe(true);
    expect(streamC1.state.isDrained).toBe(false); 
    expect(streamC2.state.isDrained).toBe(false);

    await Promise.all([streamC1.promise, streamC2.promise]);
    expect(streamB.state.isDrained).toBe(true);
    expect(streamC1.state.isDrained).toBe(true);
    expect(streamC2.state.isDrained).toBe(true);

    expect(result1).toEqual([4, 8, 12, 16]);
    expect(result2).toEqual([6, 12, 18, 24]);
  });

});

import streamie from '../src';

// The retention default and its explicit opt-out. A streamie with no consumers no
// longer discards its outputs ambiently: it retains them (delivering them to any
// later consumer) and stalls on its own output backpressure, which propagates
// upstream. Producing into the void is declared with sink: true — directly, or via
// the .each / .sink() combinators — which is what every pipeline's terminal stage
// now does.
describe('sinks and output retention', () => {
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  test('a consumer-less streamie retains outputs and stalls instead of discarding', async () => {
    const s = streamie((input: number) => input * 2, { backpressureAt: { output: 3 } });
    for (let item = 1; item <= 6; item++) s.push(item);
    await delay(10);

    // Processing ran until the output threshold and parked; the rest waits queued.
    expect(s.state.count.queued.output).toBe(3);
    expect(s.state.backpressure.output).toBe(true);
    expect(s.state.count.queued.input).toBe(3);
    expect(s.state.isDrained).toBe(false);
  });

  test('retained outputs flush to a late-attaching consumer', async () => {
    const s = streamie((input: number) => input * 2, {});
    [1, 2, 3].forEach((item) => s.push(item));
    s.drain();
    await delay(5);
    // Drain cannot complete while outputs sit undelivered.
    expect(s.state.isDrained).toBe(false);
    expect(s.state.count.queued.output).toBe(3);

    const seen: number[] = [];
    const tail = s.each((item) => { seen.push(item); });
    await tail.promise;

    expect(seen).toEqual([2, 4, 6]);
    expect(s.state.isDrained).toBe(true);
  });

  test('sink: true discards outputs as they settle and drains fully', async () => {
    const s = streamie((input: number) => input * 2, { sink: true, backpressureAt: 2 });
    for (let item = 0; item < 10; item++) s.push(item);
    s.drain();
    await s.promise;

    expect(s.state.isDrained).toBe(true);
    // A sink's outputs never even reach the output queue.
    expect(s.state.count.queued.output).toBe(0);
  });

  test('a sink refuses consumers', () => {
    const s = streamie((input: number) => input, { sink: true });
    expect(() => s.map((item) => item)).toThrow('Cannot register an output on a sink streamie.');
    expect(() => s[Symbol.asyncIterator]()).toThrow('Cannot register an output on a sink streamie.');
  });

  test('.each is a terminal map: a forEach whose promise marks completion', async () => {
    const seen: number[] = [];
    const source = streamie((input: number) => input * 2, {});
    const tail = source.each((item) => { seen.push(item); });

    [1, 2, 3].forEach((item) => source.push(item));
    source.drain();
    await tail.promise;

    expect(seen).toEqual([2, 4, 6]);
    expect(tail.state.isDrained).toBe(true);
  });

  test('.sink() ends a pipeline of pure transforms', async () => {
    const source = streamie((input: number) => input, {});
    const tail = source.map((item) => item * 2).sink();

    [1, 2, 3].forEach((item) => source.push(item));
    source.drain();
    await tail.promise;

    expect(tail.state.isDrained).toBe(true);
  });

  test('push receipts on a sink still resolve with the handler output', async () => {
    const s = streamie((input: number) => input * 2, { sink: true });
    const receipt = s.push.withReceipt(21);
    await expect(receipt.promise).resolves.toBe(42);
  });
});

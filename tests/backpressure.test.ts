import streamie from '../src';

type ExternallyResolvablePromise = { promise: Promise<any>; resolve: (value: any) => void; };
function externallyResolvablePromise() {
  const output = {} as ExternallyResolvablePromise;
  output.promise = new Promise((resolve) => {
    output.resolve = resolve;
  });

  return output;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Streamie', () => {
  describe('backpressure', () => {
    test('Input and Output backpressure is correctly applied', async () => {
      // Stream A just passes them right through
      const streamA = streamie(async (input: ExternallyResolvablePromise) => input, { backpressureAt: 2});
      // Stream B awaits the items until they're resolved.
      const streamB = streamie(async (input: ExternallyResolvablePromise) => input.promise, { backpressureAt: 2 });
      streamA.registerOutput(streamB);


      const items: ExternallyResolvablePromise[] = [];
      for (let i = 0; i < 10; i++) {
        items.push(externallyResolvablePromise());
      }

      expect(streamA.state.backpressure.input || streamA.state.backpressure.output).toBe(false);
      expect(streamB.state.backpressure.input || streamB.state.backpressure.output).toBe(false);
      expect(streamB.state.count.handling).toBe(0);
      const firstBatch = items.slice(0, 3); // 3 items
      streamA.push(...firstBatch); // 3 items

      await delay(10);
      expect(streamA.state.count.queued.input).toBe(0);
      expect(streamA.state.count.queued.output).toBe(0);
      expect(streamA.state.backpressure.input).toBe(false);
      expect(streamA.state.backpressure.output).toBe(false);
      expect(streamB.state.count.queued.input).toBe(2);
      expect(streamB.state.count.handling).toBe(1);
      expect(streamB.state.backpressure.input).toBe(true);
      expect(streamB.state.backpressure.output).toBe(false);

      const secondBatch = items.slice(3, 6); // 3 items
      streamA.push(...secondBatch); // 3 items

      await delay(10);
      expect(streamA.state.count.queued.input).toBe(1);
      expect(streamA.state.count.queued.output).toBe(2);
      expect(streamA.state.backpressure.input).toBe(false);
      expect(streamA.state.backpressure.output).toBe(true);
      expect(streamB.state.count.queued.input).toBe(2);
      expect(streamB.state.count.handling).toBe(1);
      expect(streamB.state.backpressure.input).toBe(true);
      expect(streamB.state.backpressure.output).toBe(false);

      // Resolve the currently handling item
      firstBatch[0].resolve(null);
      await delay(10);
      expect(streamA.state.count.queued.input).toBe(0);
      expect(streamA.state.count.queued.output).toBe(2);
      expect(streamA.state.backpressure.input).toBe(false);
      expect(streamA.state.backpressure.output).toBe(true);
      expect(streamB.state.count.queued.input).toBe(2);
      expect(streamB.state.count.handling).toBe(1);
      expect(streamB.state.backpressure.input).toBe(true);
      expect(streamB.state.backpressure.output).toBe(false);

      // Resolve the currently handling item
      firstBatch[1].resolve(null);
      await delay(10);

      expect(streamA.state.count.queued.input).toBe(0);
      expect(streamA.state.count.queued.output).toBe(1);
      expect(streamA.state.backpressure.input).toBe(false);
      expect(streamA.state.backpressure.output).toBe(false);
      expect(streamB.state.count.queued.input).toBe(2);
      expect(streamB.state.count.handling).toBe(1);
      expect(streamB.state.backpressure.input).toBe(true);
      expect(streamB.state.backpressure.output).toBe(false);

      // Resolve the currently handling item
      firstBatch[2].resolve(null);
      await delay(10);

      expect(streamA.state.count.queued.input).toBe(0);
      expect(streamA.state.count.queued.output).toBe(0);
      expect(streamA.state.backpressure.input).toBe(false);
      expect(streamA.state.backpressure.output).toBe(false);
      expect(streamB.state.count.queued.input).toBe(2);
      expect(streamB.state.count.handling).toBe(1);
      expect(streamB.state.backpressure.input).toBe(true);
      expect(streamB.state.backpressure.output).toBe(false);

      // Resolve the currently handling item
      secondBatch[0].resolve(null);
      await delay(10);

      expect(streamA.state.count.queued.input).toBe(0);
      expect(streamA.state.count.queued.output).toBe(0);
      expect(streamA.state.backpressure.input).toBe(false);
      expect(streamA.state.backpressure.output).toBe(false);
      expect(streamB.state.count.queued.input).toBe(1);
      expect(streamB.state.count.handling).toBe(1);
      expect(streamB.state.backpressure.input).toBe(false);
      expect(streamB.state.backpressure.output).toBe(false);

      // Resolve the currently handling item
      secondBatch[1].resolve(null);
      await delay(10);

      expect(streamA.state.count.queued.input).toBe(0);
      expect(streamA.state.count.queued.output).toBe(0);
      expect(streamA.state.backpressure.input).toBe(false);
      expect(streamA.state.backpressure.output).toBe(false);
      expect(streamB.state.count.queued.input).toBe(0);
      expect(streamB.state.count.handling).toBe(1);
      expect(streamB.state.backpressure.input).toBe(false);
      expect(streamB.state.backpressure.output).toBe(false);

      // Resolve the currently handling item
      secondBatch[2].resolve(null);
      await delay(10);

      expect(streamA.state.count.queued.input).toBe(0);
      expect(streamA.state.count.queued.output).toBe(0);
      expect(streamA.state.backpressure.input).toBe(false);
      expect(streamA.state.backpressure.output).toBe(false);
      expect(streamB.state.count.queued.input).toBe(0);
      expect(streamB.state.count.handling).toBe(0);
      expect(streamB.state.backpressure.input).toBe(false);
      expect(streamB.state.backpressure.output).toBe(false);
    });
  });
});

import streamie from '../src';

type ExternallyResolvablePromise = { promise: Promise<any>; resolve: (value: any) => void; reject: (value: any) => void; };
function externallyResolvablePromise() {
  const output = {} as ExternallyResolvablePromise;
  output.promise = new Promise((resolve, reject) => {
    output.resolve = resolve;
    output.reject = reject;
  });

  return output;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Streamie', () => {
  describe('error', () => {
    test('Error should properly propagate down to reject a child promise', async () => {
      // Stream A just passes them right through
      const streamA = streamie(async (input: ExternallyResolvablePromise) => input.promise, {});
      // Stream B awaits the items until they're resolved.
      const streamB = streamie(async (input: ExternallyResolvablePromise) => input, {});
      streamA.registerOutput(streamB);

      const handlingItem = externallyResolvablePromise();
      streamA.push(handlingItem);

      let streamARejected = false;
      let streamAOnErrorFired = false;
      streamA.promise.catch(() => streamARejected = true);
      streamA.onError(() => streamAOnErrorFired = true);
      let streamBRejected = false;
      let streamBOnErrorFired = false;
      streamB.promise.catch(() => streamBRejected = true);
      streamB.onError(() => streamBOnErrorFired = true);

      await delay(10);
      // Expect promise to not be rejected yet
      expect(streamARejected).toBe(false);
      expect(streamBRejected).toBe(false);
      expect(streamA.state.count.handling).toBe(1);

      // Reject the item
      handlingItem.reject(new Error('Test Error'));

      await delay(10);

      expect(streamARejected).toBe(true);
      expect(streamAOnErrorFired).toBe(true);
      expect(streamA.state.isHalted).toBe(true);
      expect(streamBRejected).toBe(true);
      expect(streamBOnErrorFired).toBe(true);
      expect(streamB.state.isHalted).toBe(true);
    });
  });
});

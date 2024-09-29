import streamie from '../src';
import { BatchedIfConfigured } from '../src/types';

function expectsNumber(value: number) {
  return value;
}

// Explicit type tests
type BatchedIfConfiguredTest1 = BatchedIfConfigured<number, { batchSize: 1 }>; // Expected: number
type BatchedIfConfiguredTest1Test2 = BatchedIfConfigured<number, { batchSize: 5 }>; // Expected: number[]
type BatchedIfConfiguredTest1Test3 = BatchedIfConfigured<number, {}>;               // Expected: number

const aaa: BatchedIfConfiguredTest1 = 1;
const bbb: BatchedIfConfiguredTest1Test2 = [1, 2, 3, 4, 5];
const ccc: BatchedIfConfiguredTest1Test3 = 1;



describe('Streamie', () => {
  describe('typescript types', () => {

    test('basic types', async () => {
      const a = streamie((value: number, { push, index }) => {
        const x = expectsNumber(value);
        return x;
      }, { seed: 1 });

      a.drain();

      await a.promise;
    });

    // Test the filter function
    test('filter function', async () => {
      // This works because output is not flattened, so doesn't need to be an array
      const a = streamie((value: number[], { push, index }) => {
        return 'Hello' + value[0] + value[1];
      }, { batchSize: 2 });

      a.drain();

      // This one needs to be flattened
      const b = streamie((value: number[], { push, index }) => {
        return ['Hello' + index + value[0], 'Hello' + index + value[1]];
      }, { batchSize: 2, flatten: true });

      b.drain();

      // Here we're returning a non-flattenable type, i.e. not an array, so it should be an error
      // @ts-expect-error
      const b1 = streamie((value: number[], { push, index }) => {
        return 'Hello' + value[0] + value[1];
      }, { batchSize: 2, flatten: true });

      b1.drain();

      // This one is fine because we're not flattening the output, so no error despite no array
      const b2 = streamie((value: number[], { push, index }) => {
        return 'Hello' + value[0] + value[1];
      }, { batchSize: 2, flatten: false });

      b2.drain();

      await Promise.all([a.promise, b.promise, b1.promise, b2.promise]);

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

    // Test type error when handler input type does not match batched input
    test('type error when handler input type does not match batched input', () => {
      // Should cause a type error because handler expects number but input is number[]
      // @ts-expect-error
      const a = streamie((values: number, { push, index }) => {
        push(values * 2); // Error: values is number[], cannot multiply
      }, { batchSize: 5 });
    });
  });
});
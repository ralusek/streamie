import streamie from '../src';

function expectsNumber(value: number) {
  return value;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Streamie', () => {
  describe('TypeScript Types and Configurations', () => {
    // Test streamie with batchSize > 1 without flatten
    test('streamie with batchSize > 1 without flatten', async () => {
      const a = streamie((values: number[], { push, index }) => {
        // values should be number[]
        const sum = values.reduce((acc, val) => acc + val, 0);
        return sum; // Returns number
      }, { batchSize: 3 });

      const result: number[] = [];
      a.map((value) => {
        // value should be number
        result.push(value);
      }, {});

      a.push(1);
      a.push(2);
      a.push(3); // batchSize reached, handler called
      a.push(4);
      a.push(5);
      a.push(6); // batchSize reached, handler called
      a.drain();
      await a.promise;

      expect(result).toEqual([6, 15]); // [1+2+3, 4+5+6]
    });

    // Test streamie with batchSize > 1 with flatten
    test('streamie with batchSize > 1 with flatten', async () => {
      const a = streamie((values: number[], { push, index }) => {
        // values is number[]
        // Return an array of strings
        return values.map((val) => `Value: ${val}`);
      }, { batchSize: 2, flatten: true });

      const result: string[] = [];
      const b = a.map((value) => {
        // value should be string
        result.push(value);
      }, {});

      a.push(1);
      a.push(2); // batchSize reached
      a.push(3);
      a.push(4); // batchSize reached
      a.drain();
      await b.promise;

      expect(result).toEqual(['Value: 1', 'Value: 2', 'Value: 3', 'Value: 4']);
    });

    // Test type error when handler return type does not match with flatten
    test('type error when handler return type does not match with flatten', () => {
      // Should cause a type error because handler returns non-array but flatten is true
      // @ts-expect-error
      const a = streamie((values: number[], { push, index }) => {
        return `Sum: ${values.reduce((acc, val) => acc + val, 0)}`; // Returns string
      }, { batchSize: 2, flatten: true });
    });

    // Test handler returning non-array with flatten false
    test('handler returning non-array with flatten false', async () => {
      // This is acceptable because flatten is false
      const a = streamie((values: number[], { push, index }) => {
        return `Sum: ${values.reduce((acc, val) => acc + val, 0)}`; // Returns string
      }, { batchSize: 2, flatten: false });

      const result: string[] = [];
     const b = a.map((value) => {
        // value should be string
        result.push(value);
      }, {});

      a.push(1);
      a.push(2); // batchSize reached
      a.push(3);
      a.push(4); // batchSize reached
      a.drain();

      await b.promise;

      expect(result).toEqual(['Sum: 3', 'Sum: 7']);
    });

    // Test filter function with batchSize > 1
    test('filter function with batchSize > 1', async () => {
      const a = streamie((values: number[], { push, index }) => {
        // values is number[]
        const sum = values.reduce((acc, val) => acc + val, 0);
        return sum; // Returns number
      }, { batchSize: 2 });

      const result: number[] = [];
      const filtered = a.filter((sum: number) => {
        // sum is number
        return sum % 2 === 0; // Keep even sums
      }, {});

      filtered.map((value) => result.push(value), {});

      a.push(1);
      a.push(2); // sum = 3
      a.push(3);
      a.push(5); // sum = 8 (even)
      a.push(5);
      a.push(1); // sum = 6 (even)
      a.drain();
      await filtered.promise;

      expect(result).toEqual([8, 6]); // Only even sums
    });

    // Test chaining map and filter functions
    test('chaining map and filter functions', async () => {
      const a = streamie((value: number, { push, index }) => {
        return value + 1;
      }, {});

      const result: number[] = [];

      const b = a.map((value) => value * 2, {})
       .filter((value) => value % 3 === 0, {})
       .map((value) => {
        result.push(value);
        return value;
       }, {});

      a.push(1, 2, 3, 4, 5);
      a.drain();
      await b.promise;

      // Transformation sequence:
      // [1,2,3,4,5] -> +1 -> [2,3,4,5,6] -> *2 -> [4,6,8,10,12] -> %3===0 -> [6,12]
      expect(result).toEqual([6, 12]);
    });

    // Test error handling with haltOnError true
    test('error handling with haltOnError true', async () => {
      const a = streamie(async (value: number, { push, index }) => {
        if (value === 3) {
          throw new Error('Test error');
        }
        return value * 2;
      }, { haltOnError: true, concurrency: 1 });

      const result: number[] = [];

      const b = a.map((value) => result.push(value), {});

      a.push(1, 2, 3, 4, 5);
      a.drain();

      let onErrored = false;
      a.onError((err) => {
        onErrored = true;
      });

      let erroredA = false;
      try {
        await a.promise;
      }
      catch (err) {
        erroredA = true;
      }

      let erroredB = false;
      try {
        await b.promise;
      }
      catch (err) {
        erroredB = true;
      }

      expect(onErrored).toBe(true);

      await expect(a.promise).rejects.toThrow('Encountered an error while processing input: Test error');
      await expect(b.promise).rejects.toThrow('Encountered an error while processing input: Test error');
      
      expect(erroredA).toBe(true);
      expect(erroredB).toBe(true);

      expect(result).toEqual([2, 4]); // Processing stopped after error at value 3
    });

    // Test error handling with haltOnError false
    test('error handling with haltOnError false', async () => {
      const a = streamie(async (value: number, { push, index }) => {
        if (value === 3) {
          throw new Error('Test error');
        }
        return value * 2;
      }, { haltOnError: false });

      const result: number[] = [];

      const b = a.map((value) => result.push(value), {});

      a.push(1, 2, 3, 4, 5);
      a.drain();

      await b.promise; // Should resolve despite the error
      expect(result).toEqual([2, 4, 8, 10]); // Processing continues after error at value 3
    });

    // Test processing with concurrency > 1
    test('processing with concurrency > 1', async () => {
      const processingOrder: number[] = [];
      const a = streamie(async (value: number, { push, index }) => {
        processingOrder.push(value);
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 100));
        return (value * 2);
      }, { concurrency: 2 });

      const result: number[] = [];

      const b = a.map((value) => result.push(value), {});

      a.push(1, 2, 3, 4);
      a.drain();
      await b.promise;

      expect(result.sort()).toEqual([2, 4, 6, 8]);
    });


    // Test error propagation with propagateErrors true
    test('error propagation with propagateErrors true', async () => {
      const a = streamie(async (value: number, { push, index }) => {
        if (value === 3) {
          throw new Error('Test error');
        }
        return(value * 2);
      }, { haltOnError: true, propagateErrors: true });

      const result: number[] = [];
      const b = a.map((value) => result.push(value), {});

      a.push(1, 2, 3, 4, 5);
      a.drain();

      await expect(b.promise).rejects.toThrow('Encountered an error while processing input: Test error');
      expect(result).toEqual([2, 4]); // Processing in b stopped after error
    });

    // Test error propagation with propagateErrors false
    test('error propagation with propagateErrors false', async () => {
      const a = streamie(async (value: number, { push, index }) => {
        if (value === 3) {
          throw new Error('Test error');
        }
        return (value * 2);
      }, { haltOnError: false, propagateErrors: false });

      const result: number[] = [];
      const b = a.map((value) => result.push(value), { haltOnError: true });

      a.push(1, 2, 3, 4, 5);
      a.drain();

      await b.promise; // Should resolve despite the error in a
      expect(result).toEqual([2, 4, 8, 10]); // Processing continues in b
    });


    // Test handler not allowing its seed value to dictate inferred type. Config is
    // inferred as constant, so the type would be inferred as 0 rather than number.
    // seed should be NoInfer, though, and should therefore not be used to infer the type.
    test('streamie with seed and type inference', async () => {
      const a = streamie((value: number, { push, index }) => {
        
      }, { seed: 0 });

      const result: number[] = [];
      const b = a.map((value) => result.push(value), {});

      a.drain(); // because drained in synchronous flow, seed won't be used
      await b.promise;

      expect(result).toEqual([]);
    });

    // Test multiple outputs with flatten true
    test('multiple outputs with flatten true', async () => {
      const a = streamie((value: number, { push, index }) => {
        return [value, value * 2];
      }, { flatten: true });

      const result: number[] = [];
      const b = a.map((value) => result.push(value), {});

      a.push(1);
      a.push(2);
      a.drain();
      await b.promise;

      expect(result).toEqual([1, 2, 2, 4]);
    });



    // Test that pause and resume work correctly
    test('pause and resume functionality', async () => {
      const a = streamie(async (value: number, { push, index }) => {
        return (value * 2);
      }, {});

      const result: number[] = [];
      a.map((value) => result.push(value), {});

      a.push(1, 2, 3);
      a.pause();

      // Wait to ensure processing does not continue
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(result).toEqual([]); // No processing should have occurred

      a.pause(false); // Resume
      a.drain();
      await a.promise;

      expect(result).toEqual([2, 4, 6]);
    });

    // Test that drain stops accepting new inputs
    test('drain stops accepting new inputs', async () => {
      const a = streamie((value: number, { push, index }) => {
        return (value * 2);
      }, {});

      a.push(1, 2);
      a.drain();
      // Should throw an error when trying to push after drain
      expect(() => a.push(3)).toThrow('Cannot push to a draining streamie.');

      const result: number[] = [];
      a.map((value) => result.push(value), {});
      await a.promise;

      expect(result).toEqual([2, 4]);
    });

    // Test that halt stops processing
    test('halt stops processing', async () => {
      const a = streamie(async (value: number, { push, index }) => {
        if (value === 2) {
          throw new Error('Test error');
        }
        return (value * 2);
      }, { haltOnError: true });

      const result: number[] = [];
      a.map((value) => result.push(value), {});

      a.push(1, 2, 3);
      a.drain();

      await expect(a.promise).rejects.toThrow('Test error');
      expect(result).toEqual([2]); // Processing stopped after error at value 2
    });

    // Test map function with different concurrency settings
    test('map function with different concurrency settings', async () => {
      const a = streamie(async (value: number, { push, index }) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return value * 2;
      }, { concurrency: 2 });

      const result: number[] = [];
      a.map((value) => result.push(value), {});

      a.push(1, 2, 3, 4);
      a.drain();
      await a.promise;

      expect(result.sort()).toEqual([2, 4, 6, 8]);
    });
  });
});

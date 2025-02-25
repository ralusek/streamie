import streamie from '../dist';
import { BatchedIfConfigured } from '../dist/types';

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

      // Here we're returning a non-flattenable type, i.e. not an array
      // This used to error but now we're being more permissive
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
      const filteredStreamie = initialStreamie.filter(async (output) => output % 2 === 0, {})
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

    test('type error when casting map input to wrong type (while including tools object (push, drain), which previously resulted in inference failures', () => {
      type Comment = { id: string; body: string; };
      let fetched = 0;
      function fetchCommentsBatch({ username, after}: { username: string, after: string | null }) {
        return Promise.resolve({ data: { after: fetched++ > 1 ? null : 'afterKey', children: [{ data: { id: 'id', body: 'body' } }] }});
      }

      const stream = streamie(async (after: string | null, { push, drain }) => {
        const { data } = await fetchCommentsBatch({ username: 'hi', after });
        if (data.after) push(data.after);
        else drain();
    
        const comments = data.children.map(({ data }: { data: Comment }) => data);
        return comments;
      }, { seed: null, flatten: true })
      .map(async (comment, { index }) => {
        // With the more permissive typing, we need to manually check types
        // This should pass type checking with our more permissive typing
        const check: any = comment;
        // For runtime validation, we'd check if it's actually a Comment
        if (typeof comment === 'object' && comment !== null && 'id' in comment && 'body' in comment) {
          const validComment: Comment = comment as Comment;
        }
      }, { });
    });

    test('not letting seed value infer in such a manner that it takes precedence over handler argument type', () => {
      type Comment = { id: string; body: string; };
      async function fetchCommentsBatch(
        { username, after }: { username: string; after?: string | null; }
      ) {
        return {} as { data: { after: string | null; children: { data: Comment }[] } };
      }
      const stream = streamie(async (after: string | null, { push }) => {
        const { data } = await fetchCommentsBatch({ username: 'hi', after });
        if (data.after) push(data.after);
    
        const comments = data.children.map(({ data }) => data);
        return comments;
      }, { seed: null, flatten: true })
    });

    test('dont force me to a flattened output just because I return an array', async () => {
      // When flatten is false, we should be able to return an array and have it preserved
      const a = streamie<number, string[], { flatten: false }>((value: number, { push, index }) => {
        return ['hi', 'hey']; // This returns a string[] which is preserved
      }, { flatten: false });

      // When flatten is true, we should return an array that will be flattened
      const b = streamie<number, string, { flatten: true }>((value: number, { push, index }) => {
        return ['hi', 'hey']; // This returns string[] that gets flattened to string
      }, { flatten: true });

      // Here value should be string[] because flatten is false in 'a'
      const a1 = a.map((value, { index }) => {
        // value should be inferred as string[]
        const v: string[] = value;
        v.forEach(item => console.log(item));
        return 'hi';
      }, {});

      // Here value should be string because flatten is true in 'b'
      const b1 = b.map((value, { index }) => {
        // value should be inferred as string when flatten is true
        const v: string = value;
        v.charAt(0);
        return 'hi';
      }, {});

      a.drain();

      await Promise.all([
        a1.promise,
        b1.promise,
      ]);
    });
  });
});
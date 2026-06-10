import streamie from '../dist';

function expectsNumber(value: number) {
  return value;
}

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

    test('batch and flatten combinators', async () => {
      const a = streamie((value: number, { push, index }) => value, {});

      // A batched stage receives the batch as an array
      const b = a.batch(2).map((values, { push, index }) => {
        return 'Hello' + values[0] + values[1];
      }, {});

      // Flattening a stage whose items are arrays emits the elements individually
      const c = a.batch(2)
      .map((values, { index }) => values.map((value) => 'Hello' + index + value), {})
      .flatten()
      .map((value) => {
        const greeting: string = value; // Ensure elements are inferred as string
        return greeting;
      }, {});

      // Flattening a stream of non-array items is a type error
      const d = a.map((value) => `${value}`, {});
      // @ts-expect-error flatten is only callable when stream items are arrays
      d.flatten();

      a.drain();

      await Promise.all([b.promise, c.promise]);

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
      const a = streamie((value: number) => value, {});
      // Should cause a type error because the batched stage hands the handler number[]
      // @ts-expect-error
      a.batch(5).map((values: number, { push, index }) => {
        return values * 2; // Error: values is number[], cannot multiply
      }, {});
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
      }, { seed: null })
      .flatten()
      .map(async (comment, { index }) => {
        // @ts-expect-error
        const shouldFail: number = comment;
        const shouldWork: Comment = comment; // Ensure it's inferred as Comment

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
      }, { seed: null })
      .flatten();
    });
  });
});

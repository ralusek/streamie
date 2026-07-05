import streamie, { from, merge } from '../src';

describe('merge', () => {
  test('is exposed both as a named export and on the default export', () => {
    expect(streamie.merge).toBe(merge);
  });

  test('requires a non-empty array of sources', () => {
    expect(() => merge([])).toThrow(/non-empty/);
  });

  test('a consumer of the merged streamie receives every source\'s outputs', async () => {
    const a = streamie((n: number) => n, {});
    const b = streamie((n: number) => n, {});
    const merged = merge([a, b]);
    const seen: number[] = [];
    const tail = merged.each((n) => { seen.push(n); });

    [1, 2].forEach((n) => a.push(n));
    [10, 20].forEach((n) => b.push(n));
    a.drain();
    b.drain();

    await tail.promise;
    expect(seen.sort((x, y) => x - y)).toEqual([1, 2, 10, 20]);
  });

  test('a source emitting promises has them settled by the merge stage', async () => {
    // A decoupled stage can emit thenables downstream; merge's identity handler
    // awaits them, so consumers of the merged streamie see settled values.
    const head = streamie((n: number) => n, {});
    const promises = head.produce<Promise<number>>((n, { emit }) => { emit(Promise.resolve(n * 10)); });
    const merged = merge([promises]);
    const seen: number[] = [];
    const tail = merged.each((n) => { seen.push(n); });

    [1, 2].forEach((n) => head.push(n));
    head.drain();

    await tail.promise;
    expect(seen).toEqual([10, 20]);
  });

  test('drains only once ALL sources have drained', async () => {
    const a = streamie((n: number) => n, {});
    const b = streamie((n: number) => n, {});
    const merged = merge([a, b]).sink();

    a.push(1);
    a.drain();
    await a.promise;
    expect(merged.state.isDrained).toBe(false);

    b.push(2);
    b.drain();
    await merged.promise;
    expect(merged.state.isDrained).toBe(true);
  });

  test('one aborted source among drained survivors is an ordinary drain', async () => {
    const a = streamie((n: number) => n, {});
    const b = streamie((n: number) => n, {});
    const merged = merge([a, b]).sink();

    a.push(1);
    a.drain();
    b.abort(new Error('b failed'));
    await expect(b.promise).rejects.toThrow('b failed');

    await merged.promise; // Resolves: a non-aborted data path completed.
    expect(merged.state.isAborted).toBe(false);
  });

  test('aborts only when every source aborted', async () => {
    const a = streamie((n: number) => n, {});
    const b = streamie((n: number) => n, {});
    const merged = merge([a, b]).sink();

    a.abort(new Error('a failed'));
    b.abort(new Error('b failed'));

    await expect(merged.promise).rejects.toThrow();
    expect(merged.state.isAborted).toBe(true);
  });

  test('composes with from for heterogeneous fan-in', async () => {
    const seen = await merge([from([1, 2]), from([3, 4])]).toArray();
    expect(seen.sort((x, y) => x - y)).toEqual([1, 2, 3, 4]);
  });
});

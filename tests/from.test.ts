import streamie, { from } from '../src';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('from', () => {
  test('is exposed both as a named export and on the default export', () => {
    expect(streamie.from).toBe(from);
  });

  test('feeds a pipeline from an array and drains on exhaustion', async () => {
    const seen: number[] = [];
    const tail = from([1, 2, 3, 4]).map((n) => n * 2).each((n) => { seen.push(n); });
    await tail.promise;
    expect(seen).toEqual([2, 4, 6, 8]);
  });

  test('an empty source drains cleanly, including with consumers chained in the same block', async () => {
    const seen: unknown[] = [];
    const tail = from([]).map((n) => n).each((n) => { seen.push(n); });
    await tail.promise;
    expect(seen).toEqual([]);
  });

  test('an iterable of promises yields their settled values (the core awaits thenables)', async () => {
    const collected = await from([Promise.resolve(1), 2, Promise.resolve(3)]).toArray();
    expect(collected).toEqual([1, 2, 3]);
  });

  test('feeds from a sync generator', async () => {
    function* naturals() { yield 1; yield 2; yield 3; }
    const seen: number[] = [];
    const tail = from(naturals()).each((n) => { seen.push(n); });
    await tail.promise;
    expect(seen).toEqual([1, 2, 3]);
  });

  test('feeds from an async generator', async () => {
    async function* source() {
      yield 'a';
      await wait(5);
      yield 'b';
    }
    const seen: string[] = [];
    const tail = from(source()).each((s) => { seen.push(s); });
    await tail.promise;
    expect(seen).toEqual(['a', 'b']);
  });

  test('pulls the source lazily, under the pipeline\'s backpressure', async () => {
    let pulled = 0;
    function* counting() {
      for (let i = 0; i < 1000; i++) { pulled++; yield i; }
    }
    const source = from(counting(), { backpressureAt: 10 });
    const tail = source.each(async (n) => { await wait(1); }, { backpressureAt: 10 });

    await wait(30);
    // Far fewer than 1000: the generator is only advanced as the pipeline absorbs.
    expect(pulled).toBeLessThan(200);
    source.abort(new Error('enough'));
    await expect(tail.promise).rejects.toThrow();
  });

  test('a throwing source aborts the streamie with that error', async () => {
    async function* source() {
      yield 1;
      throw new Error('source exploded');
    }
    const s = from(source());
    const tail = s.each(() => {});
    await expect(tail.promise).rejects.toThrow('source exploded');
    expect(s.state.isAborted).toBe(true);
  });

  test('terminating the streamie closes the source iterator (finally runs)', async () => {
    let closed = false;
    async function* source() {
      try {
        for (let i = 0; ; i++) {
          yield i;
          await wait(1);
        }
      } finally {
        closed = true;
      }
    }
    const s = from(source());
    const taken = await s.take(3).toArray();
    expect(taken).toEqual([0, 1, 2]);

    // .take detaches voluntarily (like breaking a for await), so the source streamie
    // parks on retained output for future consumers rather than assuming it is done —
    // the generator stays open until the streamie itself is terminated.
    expect(closed).toBe(false);
    s.abort();
    s.promise.catch(() => {}); // The abort rejection is expected.
    await wait(50);
    expect(closed).toBe(true);
  });

  test('a downstream failure propagates back and stops the pump', async () => {
    let closed = false;
    async function* source() {
      try {
        for (let i = 0; ; i++) {
          yield i;
          await wait(1);
        }
      } finally {
        closed = true;
      }
    }
    const s = from(source());
    const tail = s.each((n) => {
      if (n === 2) throw new Error('downstream failed');
    });
    await expect(tail.promise).rejects.toThrow('downstream failed');
    await wait(50);
    expect(closed).toBe(true);
    expect(s.state.isHalted).toBe(true);
  });
});

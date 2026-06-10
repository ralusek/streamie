import streamie from '../src';

// These tests assert reachability rather than heap size: once a pipeline is drained,
// nothing inside the library should still hold the streamies (event handler sets,
// registered input/output sets, pending timeouts) or the items that flowed through
// them ({input, output} pairings on the output queues). Unlike the heap-growth
// heuristics in memoryLeak.test.ts, a failure here points directly at a retained
// reference. Requires --expose-gc; run via npm run test:memory.

const describeIfGc = global.gc ? describe : describe.skip;

describeIfGc('streamie collectability', () => {
  // Forces GC repeatedly until the predicate holds. A single gc() is not sufficient:
  // a WeakRef's target is kept alive until the end of the turn in which the ref was
  // created or last dereferenced, and some internal references are only released by a
  // pending macrotask (e.g. drain()'s final setTimeout), so each attempt yields the
  // event loop before collecting again.
  async function gcUntil(predicate: () => boolean, attempts = 10): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 0));
      global.gc!();
      if (predicate()) return true;
    }
    return predicate();
  }

  it('releases every stage of a drained pipeline once external references are dropped', async () => {
    // The pipeline is built and drained inside a function scope that returns only
    // WeakRefs, so that no test-scope variable keeps any stage reachable.
    const stageRefs = await (async () => {
      const source = streamie(async (x: { n: number }) => ({ n: x.n * 2 }), {});
      const mapped = source.map(async (x) => [x, x], {});
      const flattened = mapped.flatten();
      const batched = flattened.batch(2);
      const tail = batched.filter(() => true, {});

      [{ n: 1 }, { n: 2 }, { n: 3 }].forEach((item) => source.push(item));
      source.drain();
      await tail.promise;

      return [source, mapped, flattened, batched, tail].map((stage) => new WeakRef(stage));
    })();

    expect(await gcUntil(() => stageRefs.every((ref) => ref.deref() === undefined))).toBe(true);
  });

  it('releases the items that flowed through a drained pipeline, even while the streamies remain referenced', async () => {
    // Holds the stages alive for the duration of the test; only the items must
    // become collectable.
    const stages: unknown[] = [];

    const itemRefs = await (async () => {
      const items = [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }];
      const source = streamie(async (x: { n: number }) => ({ doubled: x.n * 2 }), {});
      const tail = source.batch(2).map(async (pair) => pair.length, {});
      stages.push(source, tail);

      items.forEach((item) => source.push(item));
      source.drain();
      await tail.promise;

      return items.map((item) => new WeakRef(item));
    })();

    expect(await gcUntil(() => itemRefs.every((ref) => ref.deref() === undefined))).toBe(true);
    expect(stages).toHaveLength(2);
  });

  it('releases a halted pipeline once external references are dropped', async () => {
    const stageRefs = await (async () => {
      const source = streamie(async (x: number) => {
        if (x === 2) throw new Error('halt');
        return x;
      }, {});
      const tail = source.map(async (x) => x * 2, {});

      [1, 2, 3].forEach((item) => source.push(item));
      await expect(source.promise).rejects.toThrow();
      await expect(tail.promise).rejects.toThrow();

      return [source, tail].map((stage) => new WeakRef(stage));
    })();

    expect(await gcUntil(() => stageRefs.every((ref) => ref.deref() === undefined))).toBe(true);
  });
});

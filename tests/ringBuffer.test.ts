import RingBuffer from '../src/utils/dataStructures/ringBuffer';

describe('RingBuffer', () => {
  it('dequeues in FIFO order and reports length', () => {
    const rb = new RingBuffer<number>();
    expect(rb.length).toBe(0);
    expect(rb.shift()).toBeUndefined();

    rb.push(1);
    rb.push(2);
    rb.push(3);
    expect(rb.length).toBe(3);
    expect(rb.shift()).toBe(1);
    expect(rb.shift()).toBe(2);
    expect(rb.shift()).toBe(3);
    expect(rb.shift()).toBeUndefined();
    expect(rb.length).toBe(0);
  });

  it('preserves order across wrap-around', () => {
    // Requested capacity below the constructor minimum rounds up to 16 slots.
    const rb = new RingBuffer<number>(4);

    // Interleave pushes and shifts so head/tail lap the backing array repeatedly.
    let next = 0;
    let expected = 0;
    for (let cycle = 0; cycle < 100; cycle++) {
      for (let i = 0; i < 7; i++) rb.push(next++);
      for (let i = 0; i < 7; i++) expect(rb.shift()).toBe(expected++);
    }
    expect(rb.length).toBe(0);
  });

  it('grows past its initial capacity without losing order', () => {
    const rb = new RingBuffer<number>();
    // Misalign head from 0 first so growth has to re-linearize a wrapped buffer.
    for (let i = 0; i < 10; i++) rb.push(-1);
    for (let i = 0; i < 10; i++) rb.shift();

    const N = 10_000; // forces many doublings from the initial capacity of 16
    for (let i = 0; i < N; i++) rb.push(i);
    expect(rb.length).toBe(N);
    for (let i = 0; i < N; i++) expect(rb.shift()).toBe(i);
    expect(rb.length).toBe(0);
  });

  it('shiftMany returns up to max items in order, fewer when the buffer runs short', () => {
    const rb = new RingBuffer<number>();
    for (let i = 0; i < 10; i++) rb.push(i);

    expect(rb.shiftMany(3)).toEqual([0, 1, 2]);
    expect(rb.shiftMany(3)).toEqual([3, 4, 5]);
    expect(rb.length).toBe(4);
    // Asking for more than remains returns what's there.
    expect(rb.shiftMany(100)).toEqual([6, 7, 8, 9]);
    expect(rb.shiftMany(3)).toEqual([]);
    expect(rb.length).toBe(0);

    // And the buffer is still usable afterwards.
    rb.push(42);
    expect(rb.shift()).toBe(42);
  });

  it('shiftMany works across the wrap-around boundary', () => {
    const rb = new RingBuffer<number>(16);
    // Advance head close to the end of the 16-slot backing array...
    for (let i = 0; i < 14; i++) rb.push(-1);
    for (let i = 0; i < 14; i++) rb.shift();
    // ...then enqueue items that straddle the wrap point.
    for (let i = 0; i < 8; i++) rb.push(i);

    expect(rb.shiftMany(8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('matches a plain-array reference model under randomized interleaved operations', () => {
    const rb = new RingBuffer<number>();
    const model: number[] = [];
    // Deterministic LCG so failures are reproducible.
    let seed = 12345;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

    let next = 0;
    for (let op = 0; op < 20_000; op++) {
      const r = rand();
      if (r < 0.5) {
        rb.push(next);
        model.push(next++);
      } else if (r < 0.8) {
        expect(rb.shift()).toEqual(model.shift());
      } else {
        const n = Math.floor(rand() * 5);
        expect(rb.shiftMany(n)).toEqual(model.splice(0, n));
      }
      expect(rb.length).toBe(model.length);
    }
  });

  it('clears dequeued slots so items are not retained by the backing array', () => {
    // Reaches into the private backing array deliberately: releasing dequeued items
    // for GC is part of the contract (see the collectability tests), and there is
    // no public surface through which to observe it.
    const rb = new RingBuffer<{ id: number }>();
    for (let i = 0; i < 10; i++) rb.push({ id: i });
    for (let i = 0; i < 5; i++) rb.shift();
    rb.shiftMany(5);

    const slots = (rb as unknown as { buffer: unknown[] }).buffer;
    expect(slots.every((slot) => slot === undefined)).toBe(true);
  });

  it('keeps clearing vacated slots across growth of a wrapped buffer', () => {
    const rb = new RingBuffer<{ id: number }>();
    // Wrap head away from 0 so growth has to re-linearize a split buffer.
    for (let i = 0; i < 10; i++) rb.push({ id: -1 });
    for (let i = 0; i < 10; i++) rb.shift();
    // Overfill past the initial 16 slots to force doublings (16 -> 64).
    for (let i = 0; i < 40; i++) rb.push({ id: i });

    // Dequeue half; the vacated slots of the post-growth array must be cleared.
    for (let i = 0; i < 20; i++) expect(rb.shift()!.id).toBe(i);
    const slots = (rb as unknown as { buffer: unknown[] }).buffer;
    expect(slots.filter((slot) => slot !== undefined)).toHaveLength(rb.length);

    // The remainder still dequeues FIFO, and the buffer ends fully cleared.
    for (let i = 20; i < 40; i++) expect(rb.shift()!.id).toBe(i);
    expect(slots.every((slot) => slot === undefined)).toBe(true);
  });

  it('shiftMany(0) returns an empty array and removes nothing', () => {
    const rb = new RingBuffer<number>();
    rb.push(1);
    rb.push(2);
    expect(rb.shiftMany(0)).toEqual([]);
    expect(rb.length).toBe(2);
    expect(rb.shift()).toBe(1);
    expect(rb.shift()).toBe(2);
  });

  it('shiftMany rejects negative and non-integer counts with a clear error', () => {
    const rb = new RingBuffer<number>();
    rb.push(1);
    expect(() => rb.shiftMany(-1)).toThrow('non-negative integer');
    expect(() => rb.shiftMany(1.5)).toThrow('non-negative integer');
    expect(() => rb.shiftMany(NaN)).toThrow('non-negative integer');
    // The rejected calls left the buffer unharmed.
    expect(rb.length).toBe(1);
    expect(rb.shift()).toBe(1);
  });

  it('rounds a requested capacity above the minimum up to the next power of two', () => {
    const rb = new RingBuffer<number>(100);
    const slots = (rb as unknown as { buffer: unknown[] }).buffer;
    expect(slots.length).toBe(128);

    // The full rounded capacity is usable without growth, and FIFO order holds.
    for (let i = 0; i < 128; i++) rb.push(i);
    expect((rb as unknown as { buffer: unknown[] }).buffer).toBe(slots);
    for (let i = 0; i < 128; i++) expect(rb.shift()).toBe(i);
    expect(rb.length).toBe(0);
  });

  it('rejects a non-finite or negative initial capacity', () => {
    expect(() => new RingBuffer(Infinity)).toThrow('finite, non-negative');
    expect(() => new RingBuffer(-1)).toThrow('finite, non-negative');
    expect(() => new RingBuffer(NaN)).toThrow('finite, non-negative');
  });

  it('clear empties the buffer, releases every slot, and keeps it usable at the same capacity', () => {
    const rb = new RingBuffer<{ id: number }>();
    // Wrap first so clearing must also be correct for a non-zero head.
    for (let i = 0; i < 12; i++) rb.push({ id: -1 });
    for (let i = 0; i < 12; i++) rb.shift();
    for (let i = 0; i < 10; i++) rb.push({ id: i });

    const slotsBefore = (rb as unknown as { buffer: unknown[] }).buffer;
    rb.clear();

    expect(rb.length).toBe(0);
    expect(rb.shift()).toBeUndefined();
    // Every reference is released, and the backing array is retained (no reallocation).
    expect(slotsBefore.every((slot) => slot === undefined)).toBe(true);
    expect((rb as unknown as { buffer: unknown[] }).buffer).toBe(slotsBefore);

    // Still fully usable afterwards.
    for (let i = 0; i < 5; i++) rb.push({ id: i });
    expect(rb.shiftMany(5).map((item) => item.id)).toEqual([0, 1, 2, 3, 4]);
  });
});

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
});

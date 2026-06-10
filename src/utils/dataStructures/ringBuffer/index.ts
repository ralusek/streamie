/**
 * A growable ring buffer (circular queue): one contiguous backing array plus two
 * integer cursors. Used for the streamie input/output queues in place of plain
 * arrays.
 *
 * Why not a plain array? Array#shift / Array#splice(0, n) reindex every remaining
 * element, making each dequeue O(queue length). A streamie whose input queue gets
 * deep (e.g. a large synchronous push backlog) then pays quadratic total cost just
 * to move items through. The ring buffer dequeues in O(1): read a slot, clear it,
 * advance a cursor. Nothing else moves. (Measured: benchmark/queue-backlog.js.)
 *
 * Why not a linked list? Same O(1) dequeue, but a linked list allocates a node
 * object per item — pure GC churn on a hot path that can see millions of items —
 * and its nodes are scattered across the heap, so traversal is cache-hostile.
 * The ring buffer allocates only when it grows (a doubling that happens at most
 * log2(peak depth) times, ever), and its items sit contiguously in memory.
 *
 * Behavioral notes:
 *  - Capacity is always a power of two, so wrapping a cursor is a bitwise AND
 *    against (capacity - 1) instead of a modulo.
 *  - The backing array only grows; it never shrinks after a spike. In streamie,
 *    backpressure bounds queue depth, so steady-state capacity is small and
 *    reached quickly. If shrinking ever proves necessary, do it on measurement,
 *    not speculation.
 *  - Dequeued slots are explicitly cleared. Without that, a dequeued item would
 *    remain reachable through the backing array until its slot happened to be
 *    overwritten — a leak class tests/collectability.test.ts exists to catch.
 */
export default class RingBuffer<T> {
  // Backing storage. Created with .fill(undefined) so V8 treats it as a packed
  // (hole-free) array, which stays on faster element access paths than a holey one.
  private buffer: (T | undefined)[];

  // Index of the oldest item — the next to be dequeued (meaningful when length > 0).
  private head = 0;

  // Index at which the next enqueued item will be written.
  private tail = 0;

  // Item count, tracked explicitly: head === tail is ambiguous between empty and
  // full, and queue length is read constantly by streamie's backpressure checks,
  // so it must be a free integer read.
  private count = 0;

  constructor(initialCapacity = 16) {
    // Round the requested capacity up to a power of two (minimum 16) so the
    // wrap-around bitmask invariant holds regardless of what the caller passes.
    let capacity = 16;
    while (capacity < initialCapacity) capacity *= 2;
    this.buffer = new Array(capacity).fill(undefined);
  }

  get length(): number {
    return this.count;
  }

  /**
   * Enqueues a single item. Amortized O(1): the only non-constant work is the
   * occasional capacity doubling, whose copies amortize to O(1) per push.
   *
   * Single-item by design — accepting variadic args here would allocate an
   * arguments array on every call. Callers with multiple items loop.
   */
  push(item: T): void {
    if (this.count === this.buffer.length) this.grow();
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) & (this.buffer.length - 1);
    this.count++;
  }

  /**
   * Dequeues the oldest item, or returns undefined when empty. O(1).
   */
  shift(): T | undefined {
    if (this.count === 0) return undefined;
    const item = this.buffer[this.head];
    // Clear the slot so the dequeued item is no longer reachable through the
    // buffer (see the collectability note in the header).
    this.buffer[this.head] = undefined;
    this.head = (this.head + 1) & (this.buffer.length - 1);
    this.count--;
    return item;
  }

  /**
   * Dequeues up to `max` of the oldest items, in order. O(items returned) — the
   * unavoidable minimum, since the items must be materialized as an array for the
   * caller — with no dependence on how many items remain behind them (unlike
   * Array#splice(0, max), which reindexes the entire remainder).
   *
   * Replaces the `splice(0, batchSize)` batching idiom.
   */
  shiftMany(max: number): T[] {
    const n = max < this.count ? max : this.count;
    const out: T[] = new Array(n);
    const mask = this.buffer.length - 1;
    for (let i = 0; i < n; i++) {
      const index = (this.head + i) & mask;
      out[i] = this.buffer[index] as T;
      this.buffer[index] = undefined; // Clear for the same reachability reason as shift.
    }
    this.head = (this.head + n) & mask;
    this.count -= n;
    return out;
  }

  /**
   * Doubles capacity, copying the live items into the new array in dequeue order
   * (re-linearized so head starts back at 0 — simpler than preserving the split,
   * and the copy is the same cost either way).
   */
  private grow(): void {
    const old = this.buffer;
    const mask = old.length - 1;
    const next: (T | undefined)[] = new Array(old.length * 2).fill(undefined);
    for (let i = 0; i < this.count; i++) {
      next[i] = old[(this.head + i) & mask];
    }
    this.buffer = next;
    this.head = 0;
    this.tail = this.count;
  }
}

// Types
import type { PushReceipt as PublicPushReceipt } from '../../types.js';

// Settlement states. Numeric rather than string for cheap comparison on a path that
// runs once per externally pushed item.
const PENDING = 0;
const RESOLVED = 1;
const REJECTED = 2;

/**
 * The per-item receipt returned by push: records the item's eventual outcome, but
 * only materializes a Promise when .promise is actually accessed.
 *
 * The laziness is the whole point, and it is the same reason the streamie's own
 * promise is lazy (see the externalPromise note in src/index.ts): most pushes are
 * fire-and-forget, and an eagerly created promise per pushed item would both cost a
 * promise allocation on every push and turn any pipeline error into a flood of
 * unhandled-rejection warnings, one per unobserved receipt. A receipt that settles
 * before its promise exists simply stores the outcome; first access converts it into
 * an already-settled promise, at which point an unhandled rejection is genuinely the
 * accessor's to deal with.
 *
 * Settlement is one-shot: whichever of _resolve/_reject lands first wins, and later
 * calls are ignored (e.g. a halt sweeping the queue after an item already settled).
 */
export default class PushReceipt<O> implements PublicPushReceipt<O> {
  // A snapshot of the input backpressure state the push produced, not a live view
  // (the streamie's state.backpressure.input serves that): pushes are never refused,
  // so this is the producer's cue to pause and resume on onBackpressureRelease.
  constructor(public readonly backpressure: boolean) {}

  private status: typeof PENDING | typeof RESOLVED | typeof REJECTED = PENDING;

  // Holds the resolution value or rejection error when settlement happens before the
  // promise has been created; transferred into the promise on first access. Retained
  // for the receipt's lifetime thereafter, which is no more than a promise would
  // retain — the receipt itself is only reachable through the pusher's reference.
  private settledWith: unknown = undefined;

  private promiseResolve: ((value: O) => void) | null = null;
  private promiseReject: ((error: unknown) => void) | null = null;
  private promiseInstance: Promise<O> | null = null;

  get promise(): Promise<O> {
    if (this.promiseInstance) return this.promiseInstance;
    if (this.status === RESOLVED) return this.promiseInstance = Promise.resolve(this.settledWith as O);
    if (this.status === REJECTED) return this.promiseInstance = Promise.reject(this.settledWith);
    return this.promiseInstance = new Promise<O>((resolve, reject) => {
      this.promiseResolve = resolve;
      this.promiseReject = reject;
    });
  }

  /** @internal Invoked by the owning streamie when the item's handler invocation settles. */
  _resolve(value: O): void {
    if (this.status !== PENDING) return;
    this.status = RESOLVED;
    if (this.promiseResolve) {
      this.promiseResolve(value);
      this.promiseResolve = null;
      this.promiseReject = null;
    } else {
      this.settledWith = value;
    }
  }

  /** @internal Invoked by the owning streamie when the item's invocation errors, or when a halt abandons it. */
  _reject(error: unknown): void {
    if (this.status !== PENDING) return;
    this.status = REJECTED;
    if (this.promiseReject) {
      this.promiseReject(error);
      this.promiseResolve = null;
      this.promiseReject = null;
    } else {
      this.settledWith = error;
    }
  }
}

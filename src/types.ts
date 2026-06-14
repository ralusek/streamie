import { StreamieQueueError } from './error';
import type { Subscribe, Unsubscribe } from './utils/events';

export type { Subscribe, Unsubscribe };

export type MaybePromise<T> = T | Promise<T>;

export type Config = {
  backpressureAt?: number | {
    input?: number;
    output?: number;
  };
  concurrency?: number;
  haltOnError?: boolean;
  propagateErrors?: boolean;
  // Declares this streamie a terminal stage: its handler is the endpoint, so outputs
  // are discarded as they settle (skipping the output queue entirely) instead of
  // being held for consumers, and registering a consumer throws. backpressureAt.output
  // has no effect on a sink — there is no output queue. Without this, a streamie with
  // no consumers retains its outputs — bounded by backpressureAt.output — and stalls,
  // propagating backpressure upstream: producing into the void must be asked for,
  // never ambient. The .each and .sink combinators are the usual ways to get a sink;
  // this flag is their lower-level form.
  sink?: boolean;
  // By default, a consumer halt that leaves a streamie with no consumers at all
  // halts (aborts) it too: every path its outputs could take ended in failure, so
  // there is nothing left to produce for, and the failure propagates upstream stage
  // by stage — rejecting every stage's promise with the root error and releasing
  // any bridged source. Voluntary detaches (a drain, an async iterator break) never
  // trigger this, and a surviving sibling consumer prevents it. keepAlive opts this
  // streamie out, for a deliberately long-lived source (a hub) whose ephemeral
  // consumers come, fail, and are replaced: it instead retains its outputs and
  // parks on backpressure, exactly as if the consumers had detached voluntarily.
  keepAlive?: boolean;
  // Escape hatch for purely synchronous pipelines (handlers that settle without
  // real I/O or timers, fed by a source that never runs dry), which could otherwise
  // monopolize the event loop: processing yields via a macrotask after running
  // continuously this long (milliseconds; default 100). Pipelines doing real
  // asynchronous work yield naturally and never hit this.
  yieldAfter?: number;
};

export type BatchConfig = Config & {
  // The maximum amount of time to wait for a full batch to accumulate before handling
  // a partial one.
  maxBatchWait?: number;
};

// Batching, flattening, and filtering are implemented by the core process loop, but are
// only exposed publicly through the batch/flatten/filter combinators, which configure
// them via this internal type. Keeping them off the public Config is what allows
// Streamie's types to stay free of conditional types.
/** @internal */
export type InternalConfig = Config & {
  batchSize?: number;
  maxBatchWait?: number;
  flatten?: boolean;
  isFilter?: boolean;
};

export type Tools<I> = {
  // The streamie's own public push. Typing the receipt's promise here would be
  // circular — it resolves with the very output type the handler receiving these
  // tools is in the middle of defining — so tools expose only the synchronous
  // metadata. (At runtime it is the full receipt, for the untyped/casting caller.)
  push: (item: I) => { backpressure: boolean };
  drain: () => void;
  index: number;
};

// The payload of the halted event, distinguishing how the halt came about. A halt is
// either externally imposed via abort() — own or cascaded from upstream — or the
// result of a handler error under haltOnError. The fields are deliberately all
// present rather than collapsed into a single error: a streamie can carry a handler
// error (haltOnError: false) and later be aborted, and subscribers like stream
// bridges may care about both.
export type StreamieHaltPayload<I> = {
  // True when the halt came from abort() rather than a handler error.
  isAborted: boolean;
  // Whatever abort() was called with — an arbitrary external value, not necessarily
  // a StreamieQueueError. Undefined for a bare abort() and for non-abort halts.
  abortError: unknown;
  // The last error thrown by this streamie's own handler invocations, if any.
  lastError: StreamieQueueError<I> | null;
};

// The synchronous result of a push.
export type PushReceipt<O> = {
  // Whether this push left the streamie at or beyond its input backpressure
  // threshold. Pushes are never refused, so ignoring this only grows the input
  // queue; a cooperative producer seeing true should pause and resume on the
  // onBackpressureRelease event.
  readonly backpressure: boolean;

  // Resolves once the item's handler invocation has settled, with the output it
  // produced: the handler's settled return value, or, for a filter stage, the item
  // itself whether or not it passed — the promise signals "finished processing",
  // not "produced output". Rejects with the StreamieQueueError if the invocation
  // threw, or, if the streamie halts before the item is ever handled, with the
  // halting error.
  //
  // Created lazily on first access: an unobserved receipt allocates no promise and
  // can never produce an unhandled rejection when the pipeline errors.
  readonly promise: Promise<O>;
};

export type Handler<I, R> = (
  input: I,
  tools: Tools<I>,
) => MaybePromise<R>;

export type FilterHandler<I> = (
  input: I,
  tools: Tools<I>,
) => MaybePromise<boolean>;

export type Streamie<I, O> = {
  // Synchronous; returns a receipt carrying the backpressure state the push produced
  // and a lazy promise for the item's output — see PushReceipt.
  push: (item: I) => PushReceipt<O>;

  map: <R>(handler: Handler<O, R>, config?: Config) => Streamie<O, Awaited<R>>;

  // A .map that is also a terminal stage (sink: true): the handler is the endpoint —
  // a forEach. Outputs are discarded as they settle and consumers cannot be
  // registered; await .promise on the returned streamie for completion.
  each: <R>(handler: Handler<O, R>, config?: Config) => Streamie<O, Awaited<R>>;

  filter: (handler: FilterHandler<O>, config?: Config) => Streamie<O, O>;

  batch: (batchSize: number, config?: BatchConfig) => Streamie<O, O[]>;

  // Reports whether this streamie is a batching stage (created via .batch). With no
  // argument: true when a batch size was configured, including .batch(1) — a batching
  // stage that emits single-element arrays, observably distinct from an unbatched
  // streamie. With a size: whether the configured batch size is exactly that value. An
  // unbatched streamie reports false for every query.
  isBatched: (batchSize?: number) => boolean;

  // Only callable when the stream's items are themselves arrays; emits their elements
  // individually.
  flatten: [O] extends [readonly (infer E)[]]
    ? (config?: Config) => Streamie<O, E>
    : never;

  // Appends an explicit terminal stage (an identity .each): a pipeline built of
  // pure transforms ends with .sink() to declare that reaching the end *is* the
  // point, letting the chain drain rather than retain its final outputs.
  sink: (config?: Config) => Streamie<O, O>;

  pause: (shouldPause?: boolean) => void;
  drain: () => void;

  // Terminates the streamie abnormally through the halt machinery, optionally with an
  // arbitrary external error. The error becomes the abortError of the onHalted
  // payload, rejects the streamie's promise and any queued push receipts, and is
  // delivered to async iterations as a rejection. Idempotent, and a no-op on a
  // streamie that has already halted or drained. An abort cascades downstream only
  // when a consumer's feeders have all aborted, and upstream only when a feeder is
  // left with no consumers at all (see Config.keepAlive) — so aborting any stage
  // tears down exactly the parts of the pipeline with nothing left to live for.
  abort: (error?: unknown) => void;

  registerInput: (inputStreamie: Streamie<any, I>) => void;
  registerOutput: (outputStreamie: Streamie<O, any>) => void;

  // Each call registers a fresh consumer of this streamie's outputs, participating in
  // backpressure: the source only stays ahead of the iterator's pulls by its own
  // bounded output queue. Concurrent iterators each observe every item (outputs are
  // broadcast to all consumers). An iterator attached to a previously consumer-less
  // streamie receives retained backlog; otherwise it observes only items not yet
  // delivered to existing consumers.
  [Symbol.asyncIterator]: () => AsyncIterableIterator<O>;

  // Lifecycle events. Each is callable to attach a persistent handler and carries
  // .once for handlers that remove themselves after one invocation; both return an
  // unsubscribe function. The draining/drained/halted transitions are one-way and
  // latch: a handler attached after the transition has occurred is invoked
  // immediately. backpressureRelease and error are recurring.
  onBackpressureRelease: Subscribe;
  onDrained: Subscribe;
  onDraining: Subscribe;
  onError: Subscribe<StreamieQueueError<I>>;
  onHalted: Subscribe<StreamieHaltPayload<I>>;

  _pushQueueError: (error: StreamieQueueError<any>) => void;
  _receive: (...items: I[]) => void;

  state: {
    backpressure: {
      input: boolean;
      output: boolean;
    };
    isPaused: boolean;
    isDrained: boolean;
    isHalted: boolean;
    isAborted: boolean;
    // The configured batch size: null when unbatched, the size passed to .batch
    // otherwise (including 1). Intent, not the internal dequeue count.
    batchSize: number | null;
    count: {
      handling: number;
      started: number;
      queued: {
        input: number;
        output: number;
      };
    };
  };

  promise: Promise<null>;
};

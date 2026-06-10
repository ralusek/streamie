import { StreamieQueueError } from './error';

export type MaybePromise<T> = T | Promise<T>;

export type Config = {
  backpressureAt?: number | {
    input?: number;
    output?: number;
  };
  concurrency?: number;
  haltOnError?: boolean;
  propagateErrors?: boolean;
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

  filter: (handler: FilterHandler<O>, config?: Config) => Streamie<O, O>;

  batch: (batchSize: number, config?: BatchConfig) => Streamie<O, O[]>;

  // Only callable when the stream's items are themselves arrays; emits their elements
  // individually.
  flatten: [O] extends [readonly (infer E)[]]
    ? (config?: Config) => Streamie<O, E>
    : never;

  pause: (shouldPause?: boolean) => void;
  drain: () => void;

  registerInput: (inputStreamie: Streamie<any, I>) => void;
  registerOutput: (outputStreamie: Streamie<O, any>) => void;

  // Each call registers a fresh consumer of this streamie's outputs, participating in
  // backpressure: the source only stays ahead of the iterator's pulls by its own
  // bounded output queue. Concurrent iterators each observe every item (outputs are
  // broadcast to all consumers); an iterator only observes items processed after it
  // was created.
  [Symbol.asyncIterator]: () => AsyncIterableIterator<O>;

  onBackpressureRelease: (eventHandler: () => void) => void;
  onDrained: (eventHandler: () => void) => void;
  onDraining: (eventHandler: () => void) => void;
  onError: (eventHandler: (error: StreamieQueueError<I>) => void) => void;
  onHalted: (eventHandler: () => void) => void;

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

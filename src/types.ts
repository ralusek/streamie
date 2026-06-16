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
  // By default a stage produces one output per handler invocation: the handler's
  // settled return value is emitted automatically. Set false to decouple output from
  // return — the handler is handed an `emit` in its tools and produces as many (or as
  // few) outputs as it likes, whenever it likes; the return value then feeds only the
  // push receipt, not the pipeline. This is the primitive the filter and flatten
  // combinators are built on (a conditional emit and a per-element emit, respectively).
  automaticallyEmit?: boolean;
};

export type BatchConfig = Config & {
  // The maximum amount of time to wait for a full batch to accumulate before handling
  // a partial one.
  maxBatchWait?: number;
};

// Batching is implemented by the core process loop (filtering and flattening are now
// ordinary automaticallyEmit: false stages built on tools.emit), exposed publicly only
// through the batch combinator, which configures it via this internal type. Keeping
// these off the public Config is what allows Streamie's types to stay free of
// conditional types.
/** @internal */
export type InternalConfig = Config & {
  batchSize?: number;
  maxBatchWait?: number;
};

export type Tools<I, O = never> = {
  // The streamie's own public push. Typing the receipt's promise here would be
  // circular — it resolves with the very output type the handler receiving these
  // tools is in the middle of defining — so tools expose only the synchronous
  // metadata. (At runtime it is the full receipt, for the untyped/casting caller.)
  push: (item: I) => { backpressure: boolean };
  drain: () => void;
  // Appends an output to this stage, delivered to consumers exactly like an
  // automatically-emitted return value. The general form of producing output: a
  // normal stage emits its return value once for you, a filter emits conditionally,
  // a flatten emits once per element. A stable reference across invocations, safe to
  // call any number of times (including zero) — including from a callback scheduled
  // after the handler returns, though an emit fired once the stage has drained or halted
  // is dropped (it has nowhere left to deliver). Without automaticallyEmit: false the
  // stage also auto-emits the return value, so most handlers ignore this entirely.
  //
  // O defaults to never — the type an auto-emit handler sees. There, output IS the
  // return value, so emit must not be usable: it would be a second, untracked source of
  // output (a string emitted from a handler whose return is a number, with the stage
  // still typed Streamie<_, number>), and TypeScript cannot fold those emits into the
  // output type since it never infers a generic from a function body. never makes such a
  // call a type error while leaving return inference untouched (unlike tying emit to the
  // return type, which would put a still-being-inferred type in a parameter position and
  // break that inference). The decoupled combinator forms (automaticallyEmit: false) set
  // O instead — from an explicit type argument or an annotation on this very parameter —
  // and that typed emit is then what drives the stage's output type.
  emit: (output: O) => void;
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

// I = input item type; O = stream output type (what consumers and iterators see); R =
// the handler's settled return value. O and R coincide for an auto-emit stage (the
// return value IS the single output), and diverge only for the decoupled forms
// (automaticallyEmit: false, where emit produces O and the return is a separate R) and
// for flatten (output is each element, return is the whole pre-flatten array). R is
// what a push receipt resolves with. It defaults to O so the two-argument form
// Streamie<I, O> stays correct and unchanged for every auto-emit stage; only code that
// pushes to and awaits a decoupled/flatten stage needs the third argument. (A "don't
// care about R" position — the register methods, the bridges — must write the third
// argument as `any`, since with the default it would otherwise pin R to a concrete O.)
export type Streamie<I, O, R = O> = {
  // Synchronous; returns a receipt carrying the backpressure state the push produced
  // and a lazy promise for the item's handler-return value R — see PushReceipt.
  push: (item: I) => PushReceipt<R>;

  map: {
    // Decoupled output (automaticallyEmit: false): the stage's output type NO is the
    // caller's to supply — an explicit type argument (`.map<NO>(handler, …)`) or an
    // annotation on the emit parameter — and it types tools.emit. The handler's return
    // value is a separate type NR, inferred from the return and surfaced as the stage's
    // receipt type; it does not reach the stream. NO defaults to unknown when the caller
    // supplies neither, because TypeScript cannot infer it from the emit() calls in the
    // body. Listed first so it is chosen when the config selects it.
    // NR defaults to unknown so the explicit-output form `.map<NO>(…)` resolves here:
    // TypeScript's explicit type arguments are all-or-nothing for non-defaulted
    // parameters, so without the default, providing only NO would fail to match this
    // overload and fall through to the default one. The trade-off is that `.map<NO>()`
    // gets a precise output but an unknown receipt type (NR can't be inferred once NO is
    // given explicitly); annotating the emit parameter instead keeps BOTH precise.
    <NO, NR = unknown>(
      handler: (input: O, tools: Tools<O, NO>) => MaybePromise<NR>,
      config: Config & { automaticallyEmit: false },
    ): Streamie<O, NO, Awaited<NR>>;
    // Default: one output per invocation, the handler's settled return value — which is
    // therefore both the output and the receipt type (R defaults to O). The decoupled
    // overload above is selected only by a literal automaticallyEmit: false, so this
    // (which keeps automaticallyEmit at its plain Config type) catches everything else,
    // including internal combinator calls passing a plain Config.
    <NR>(
      handler: Handler<O, NR>,
      config?: Config,
    ): Streamie<O, Awaited<NR>>;
  };

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
  // individually. Output is the element type E, but the receipt type is the whole
  // pre-flatten array O — all the outputs the item produced — so R is O, not E.
  flatten: [O] extends [readonly (infer E)[]]
    ? (config?: Config) => Streamie<O, E, O>
    : never;

  // The general output-producing stage (automaticallyEmit: false): the handler is handed
  // tools.emit and produces zero or more outputs per input, whenever it likes, while its
  // return value feeds only the push receipt. map, filter, and flatten are specializations
  // of this. The output type NO is the caller's to supply — an explicit type argument
  // (`.produce<NO>(…)`) or an annotation on the emit parameter — since TypeScript cannot
  // infer it from the emit() calls in the body; left unsupplied it is unknown. NR (the
  // receipt type) is inferred from the return value, but, as with the decoupled .map
  // overload, providing NO explicitly forces NR to its default — annotate the emit
  // parameter instead to keep both precise.
  produce: <NO, NR = unknown>(
    handler: (input: O, tools: Tools<O, NO>) => MaybePromise<NR>,
    config?: Config,
  ) => Streamie<O, NO, Awaited<NR>>;

  // Aggregate the stream to a single value, emitted once when the stream drains: the
  // accumulator is threaded through every item and the final result is emitted on drain,
  // including the untouched initialValue when the stream produced no items. The fold is
  // sequential (concurrency 1). A push receipt resolves with the accumulator after that
  // item was folded in.
  reduce: <A>(
    reducer: (accumulator: A, item: O) => MaybePromise<A>,
    initialValue: A,
    config?: Config,
  ) => Streamie<O, A>;

  // Running reduce: the accumulator is threaded through every item and emitted after each
  // one (so an N-item stream yields N outputs, the running totals). Like reduce the fold is
  // sequential (concurrency 1); unlike reduce it emits intermediate results rather than only
  // the final one, and emits nothing for an empty stream.
  scan: <A>(
    reducer: (accumulator: A, item: O) => MaybePromise<A>,
    initialValue: A,
    config?: Config,
  ) => Streamie<O, A>;

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

  registerInput: (inputStreamie: Streamie<any, I, any>) => void;
  registerOutput: (outputStreamie: Streamie<O, any, any>) => void;

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
  // Appends a single output from outside a handler invocation, used by drain-flush
  // combinators (reduce). Not part of the public surface — like _receive it injects into
  // this streamie's queues directly and should not be called for any other reason.
  _emit: (output: O) => void;

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

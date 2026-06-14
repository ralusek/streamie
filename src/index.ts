// Types
import { StreamieQueueError } from './error';
import {
  Streamie,
  Handler,
  FilterHandler,
  Config,
  BatchConfig,
  InternalConfig,
  MaybePromise,
  Tools,
  StreamieHaltPayload,
} from './types';

// Validation
import * as validate from './validation';

// Data structures
import RingBuffer from './utils/dataStructures/ringBuffer';
import createAsyncIterator from './utils/asyncIterator';
import createEventHandlers, { event, type Unsubscribe } from './utils/events';
import PushReceipt from './utils/pushReceipt';
import yieldToMacrotask from './utils/yieldToMacrotask';
import currentSliceAge from './utils/eventLoopSlice';

// Stream bridges
import pumpReadableStream from './utils/streams/readable';
import type { ReadableStreamLike, ReadableStreamChunkOf } from './utils/streams';

type TimeoutId = ReturnType<typeof setTimeout>;

export default function streamie<I, R>(
  handler: (input: I, tools: Tools<I>) => MaybePromise<R>,
  config: Config & {
    // When calling streamie directly, we allow a seed value to be passed.
    // NoInfer keeps seed from overpowering the handler parameter type.
    seed?: NoInfer<I>;
  } = {},
): Streamie<I, Awaited<R>> {
  type OutputItem = Awaited<R>;

  // Batching, flattening, and filtering are core concerns, but are not part of the public
  // config; they are configured internally by the batch/flatten/filter combinators below.
  const internalConfig = config as InternalConfig;

  const queue: {
    input: RingBuffer<I>;
    // Receipts for externally pushed items, aligned slot-for-slot with the input
    // queue (items delivered by upstream streamies occupy a slot holding undefined).
    // null until the first public push, so streamie-to-streamie delivery — the hot
    // path — pays nothing for receipt tracking unless a receipt can actually exist.
    receipt: RingBuffer<PushReceipt<OutputItem> | undefined> | null;
    output: {
      // A queue pairing the input items with their final stream output item. The input
      // is a single item for unbatched streamies, or the handled batch for batched ones.
      success: RingBuffer<{
        input: I | I[];
        output: OutputItem;
      }>;
    };
  } = {
    // Ring buffers rather than plain arrays: dequeuing from an array via
    // shift/splice reindexes every remaining element, which goes quadratic when a
    // queue gets deep (see the rationale in the RingBuffer header and the numbers
    // in benchmark/queue-backlog.js).
    input: new RingBuffer(),
    receipt: null,
    output: {
      success: new RingBuffer(),
    },
  };

  const settings = {
    backpressureAt: validate.backpressureAt(config),
    concurrency: config.concurrency || 1,
    batchSize: internalConfig.batchSize || 1,
    // The batch size as configured (null when unbatched), kept distinct from the
    // coerced batchSize above. That one is the dequeue count, where 1 and "unbatched"
    // are the same bare-item fast path; this one preserves intent. .batch(1) is a
    // batching stage that emits single-element arrays — observably distinct from an
    // unbatched streamie — even though both dequeue one item at a time. The core only
    // ever reads batchSize; this exists for introspection (see isBatched).
    configuredBatchSize: internalConfig.batchSize ?? null,
    maxBatchWait: internalConfig.maxBatchWait || Infinity,
    isFilter: internalConfig.isFilter === true,
    haltOnError: config.haltOnError !== false,
    flatten: internalConfig.flatten === true,
    propagateErrors: config.propagateErrors !== false,
    yieldAfter: config.yieldAfter ?? 100,
    isSink: config.sink === true,
    keepAlive: config.keepAlive === true,
  };

  const state: {
    count: {
      started: number;
      handling: number;
    };
    lastHandledAt: number | null;
    backpressure: {
      input: boolean;
      output: boolean;
    };
    isDrained: boolean;
    isPaused: boolean;
    shouldDrain: boolean;
    isHalted: boolean;
    isAborted: boolean;
    // Whatever abort() was called with. Kept separate from lastError, which retains
    // its meaning of "the last error encountered within this streamie's own handlers";
    // an abort error is an arbitrary external value.
    abortError: unknown;
    lastError: StreamieQueueError<I> | null;
  } = {
    count: {
      started: 0,
      handling: 0,
    },
    lastHandledAt: null,
    // Backpressure slowly builds backwards. If you imagine that a downstream streamie has input backpressure,
    // this streamie will stop pushing to it. This means that eventually this streamie will have output backpressure,
    // and we will stop handling items. This means that eventually this streamie will have input backpressure, and
    // upstream streamies will stop pushing to it... and so on.
    backpressure: {
      // When the input queue is too long, upstream streamies should stop pushing items into the queue.
      get input() {
        return queue.input.length >= settings.backpressureAt.input;
      },
      // When the output queue is too long, this streamie should stop handling items.
      get output() {
        return queue.output.success.length >= settings.backpressureAt.output;
      },
    },
    get isDrained() {
      return state.shouldDrain && (queue.input.length === 0) && (state.count.handling === 0) && (queue.output.success.length === 0);
    },
    shouldDrain: false,
    isPaused: false,
    isHalted: false,
    isAborted: false,
    abortError: undefined,
    lastError: null,
  };

  const outputStreamies: Set<Streamie<OutputItem, any>> = new Set();
  const inputStreamies: Set<Streamie<any, I>> = new Set();

  // Abort accounting for terminated inputs (see handleInputTerminated): the abortError
  // of each input that aborted, and whether any input halted without aborting.
  const inputAbortErrors: unknown[] = [];
  let hasNonAbortHaltedInput = false;

  // The most recent Date.now() observed by the process loop (set once per work
  // iteration in checkCanProcessInput). The yield check reuses it so that yielding
  // costs a comparison, not a second clock read per item. Staleness only delays a
  // yield by one iteration: with the check running after each iteration, starvation
  // stays bounded by yieldAfter plus about two handler invocations.
  let lastClockAt = Date.now();

  const eventHandlers = createEventHandlers({
    // Fired whenever a dequeue takes the input queue back below its backpressure
    // threshold — the signal cooperative producers and upstream streamies resume on.
    backpressureRelease: event(),
    // The lifecycle transitions are one-way, so they latch: a handler attached after
    // the transition has occurred is invoked immediately, which is what frees
    // subscribers (and the registerInput/registerOutput wiring) from caring whether
    // they attached before or after the event.
    draining: event({ latching: true }),
    drained: event({ latching: true }),
    halted: event<StreamieHaltPayload<I>>({ latching: true }),
    error: event<StreamieQueueError<I>>(),
  });

  const ref: {
    // The reason we employ internal/external promise is because we want a lazily created external
    // promise (for reasons explained on the externalPromise). The problem with a lazily created
    // promise is that we don't know when it will be created, so it could have been before or after
    // the promise is resolved/errored, meaning there would need to be divergent logic to handle
    // both cases. By creating an internal promise that is always created, we can always handle
    // the promise resolution/rejection the same way, and then the lazily created external promise
    // is merely a wrapper around the internal promise.
    // Note that below we catch the internal promise so that it doesn't throw an unhandled rejection,
    // whereas the external promise is wrapped in such a manner that it will still throw an unhandled
    // rejection if it is, in fact, not handled.
    internalPromise: Promise<null>;
    // We hold off on creating a promise unless one is actually requested, because
    // most streamies in a pipeline will not actually be awaited, most likely just the last one.
    // If we create promises for all of them, even those that aren't being used, then they will all
    // have unhandled promise rejections in the event of an error.
    externalPromise: Promise<null> | null;

    timeouts: Set<TimeoutId>;

    processScheduled: boolean;

    // Whether a macrotask yield is currently pending (see scheduleYield).
    yieldScheduled: boolean;
  } = {
    internalPromise: new Promise<null>((resolve, reject) => {
      eventHandlers.drained.on(() => resolve(null));
      if (settings.haltOnError) eventHandlers.error.on((error) => reject(error));
      // An aborted streamie never drains, so without this its promise would never
      // settle. (Settlement is one-shot, so this composes with the rejections above.)
      // The undefined check (rather than ??) is deliberate: abort errors are
      // arbitrary external values, so null and other falsey reasons are delivered as
      // given; only a bare abort() gets the generic error.
      eventHandlers.halted.on(({ isAborted, abortError }) => {
        if (isAborted) reject(abortError === undefined ? new Error('Streamie was aborted.') : abortError);
      });
    }),
    externalPromise: null,
    timeouts: new Set(),
    processScheduled: false,
    yieldScheduled: false,
  };

  // We catch the internal promise so that it doesn't throw an unhandled rejection in the event of an error.
  // It being caught here will not prevent it from propagating errors to the external promise, which is what
  // we would want (if an external promise is created).
  ref.internalPromise.catch(() => {});

  // Internal functions

  // Routes a settled handler output into the output queue, applying the internal filter
  // and flatten behaviors. May throw (e.g. flattening a non-array); callers are
  // responsible for converting that into a queue error.
  function settleSuccess(handlerInput: I | I[], handlerOutput: unknown) {
    // A sink's handler is the endpoint: its outputs go nowhere by declaration, and
    // consumers can never be registered on it, so the output queue would be pure
    // overhead — skip it entirely. (Receipts still resolve with the handler output;
    // they were settled by the caller, not by this queue.)
    if (settings.isSink) return;
    // If the handler is a filter, the return value is a boolean, and if the return value is false, we
    // do not push to the output queue. If the output is truthy, we pass the input through to
    // the output queue.
    if (settings.isFilter) {
      if (!handlerOutput) return; // Handler returned false, so we do not push anything to the output queue.
      const successQueue = queue.output.success as RingBuffer<{ input: unknown, output: unknown }>;
      if (!settings.flatten) {
        successQueue.push({ input: handlerInput, output: handlerInput });
        return;
      }
      if (!Array.isArray(handlerInput)) throw new Error('Cannot flatten input that is not an array.');
      for (let i = 0; i < handlerInput.length; i++) {
        successQueue.push({ input: handlerInput[i], output: handlerInput[i] });
      }
      return;
    }

    if (settings.flatten) {
      if (!Array.isArray(handlerOutput)) throw new Error('Cannot flatten output that is not an array.');
      for (let i = 0; i < handlerOutput.length; i++) {
        queue.output.success.push({ input: handlerInput, output: handlerOutput[i] as OutputItem });
      }
    }
    else queue.output.success.push({ input: handlerInput, output: handlerOutput as OutputItem });
  }

  // The receipts dequeued alongside one handler invocation's input: a single
  // maybe-receipt for unbatched streamies, an array of maybe-receipts for batched
  // ones (undefined entries are items that arrived via _receive), or null when
  // receipt tracking was never activated.
  type InvocationReceipts = PushReceipt<OutputItem> | undefined | (PushReceipt<OutputItem> | undefined)[] | null;

  function resolveReceipts(receipts: InvocationReceipts, value: unknown) {
    if (!receipts) return;
    if (Array.isArray(receipts)) {
      for (let i = 0; i < receipts.length; i++) receipts[i]?._resolve(value as OutputItem);
    } else receipts._resolve(value as OutputItem);
  }

  function rejectReceipts(receipts: InvocationReceipts, error: unknown) {
    if (!receipts) return;
    if (Array.isArray(receipts)) {
      for (let i = 0; i < receipts.length; i++) receipts[i]?._reject(error);
    } else receipts._reject(error);
  }

  // Handles one item/batch from the input queue. Returns undefined when the handler
  // settled synchronously, or a promise that resolves once an asynchronous handler has
  // settled and its output has been enqueued.
  function processInput(): void | Promise<void> {
    const startedWithBackpressure = state.backpressure.input;

    state.lastHandledAt = Date.now();
    state.count.handling++;
    // Unbatched streamies (the common case) take the single item directly, which
    // also avoids allocating a one-item array per invocation; batched ones dequeue
    // up to a batch's worth. Only reached when checkCanProcessInput has confirmed
    // the queue is non-empty, hence the non-null assertion.
    const handlerInput = (settings.batchSize === 1
      ? queue.input.shift()!
      : queue.input.shiftMany(settings.batchSize)) as I | I[];
    // Receipts travel with their items, so the aligned slots are dequeued in the same
    // breath — before anything (like the backpressure release handlers below) can
    // re-enter processing and disturb the alignment.
    const receipts: InvocationReceipts = queue.receipt === null
      ? null
      : (settings.batchSize === 1
        ? queue.receipt.shift()
        : queue.receipt.shiftMany(settings.batchSize));

    if (startedWithBackpressure && !state.backpressure.input) {
      eventHandlers.backpressureRelease.emit();
    }

    const index = state.count.started++;

    const handleError = (err: unknown) => {
      const queueError = new StreamieQueueError(
        `Encountered an error while processing input: ${(err as Error)?.message || ''}`,
        err,
        {
          input: handlerInput,
          index,
          timestamp: Date.now(),
        },
      );

      // This invocation's receipts reject with the same error the streamie's own
      // promise will see.
      rejectReceipts(receipts, queueError);
      handleOnError(queueError);
    };

    let handlerOutput: MaybePromise<unknown>;
    try {
      handlerOutput = (handler as (input: I | I[], tools: Tools<I>) => MaybePromise<unknown>)(
        handlerInput, {
          drain: self.drain,
          push: self.push,
          index,
        },
      );
    } catch (err) {
      handleError(err);
      state.count.handling--;
      return;
    }

    if (handlerOutput && (typeof (handlerOutput as PromiseLike<unknown>).then === 'function')) {
      // Settling and the handling decrement happen in a single continuation so that the
      // handler's completion costs only one microtask hop before the caller's follow-up
      // requestProcess; extra hops here change the interleaving between connected
      // streamies (e.g. a downstream streamie finishing after an upstream promise
      // has already resolved).
      return (handlerOutput as Promise<unknown>).then(
        (output) => {
          try {
            settleSuccess(handlerInput, output);
            // A receipt resolves with what its invocation contributed downstream:
            // the handler output, except for filter stages, where the handler output
            // is the predicate's boolean and the value passed through is the input
            // itself. (For a flatten stage this is the pre-flatten array — i.e. all
            // of the outputs the item produced.)
            resolveReceipts(receipts, settings.isFilter ? handlerInput : output);
          } catch (err) {
            handleError(err);
          }
          state.count.handling--;
        },
        (err) => {
          handleError(err);
          state.count.handling--;
        },
      );
    }

    // Sync fast path: the handler returned a non-thenable, so we settle inline rather
    // than paying for promise allocation and a microtask hop on every invocation.
    try {
      settleSuccess(handlerInput, handlerOutput);
      // See the resolution-value note on the asynchronous path above.
      resolveReceipts(receipts, settings.isFilter ? handlerInput : handlerOutput);
    } catch (err) {
      handleError(err);
    }
    state.count.handling--;
  }

  function processOutput() {
    const success = queue.output.success.shift();
    outputStreamies.forEach((consumer) => {
      consumer._receive(success!.output);
    });
  }

  function checkCanProcessInput(): { canProcess: boolean, scheduleRetryIn?: number } {
    if (
      (state.isPaused || state.isHalted || state.isDrained) ||
      (state.count.handling >= settings.concurrency) ||
      (queue.input.length === 0) ||
      (state.backpressure.output)
    ) return { canProcess: false };


    // The single clock read for this process iteration; the yield check in
    // requestProcess reuses it via lastClockAt rather than reading again.
    lastClockAt = Date.now();
    const timeSinceLastHandled = state.lastHandledAt && lastClockAt - state.lastHandledAt;

    // This top level condition establishes a normal condition under which we would not handle
    // the items, as there aren't enough to justify a batch. However, we will handle them
    // given the exceptions below
    if (queue.input.length < settings.batchSize) {
      if (
        // If the queue is meant to be drained, even if the input queue is not a full batch,
        // we will still handle it.
        (!state.shouldDrain) &&
        // If we have waited too long since the last handled batch, we will handle the items
        !(timeSinceLastHandled && (timeSinceLastHandled > settings.maxBatchWait))
      ) {

        // At this point, we're already not going to handle the items the process, but if
        // there is a maxBatchWait configured, we will ensure that there is a timeout in place
        // to call processInput after the maxBatchWait time has elapsed. This is because the
        // qualification for maxBatchWait time could elapse and be qualified for a process, but
        // no attempt to process would necessarily be invoked at that time.
        if (settings.maxBatchWait && (settings.maxBatchWait !== Infinity)) return { canProcess: false, scheduleRetryIn: settings.maxBatchWait - (timeSinceLastHandled || 0)};
        return { canProcess: false };
      }
    }

    return { canProcess: true };
  }

  function checkCanProcessOutput(): { canProcess: boolean; } {
    if (
      (state.isPaused || state.isHalted || state.isDrained) ||
      (queue.output.success.length === 0) ||
      // No consumers: outputs are retained, not discarded — producing into the void
      // must be declared (sink: true), never ambient. The retained queue engages
      // output backpressure at backpressureAt.output, which stalls this streamie and,
      // through its input queue, everything upstream. The outputs are delivered if a
      // consumer attaches later. This state means no consumer has attached *yet*, or
      // they detached voluntarily: consumers lost to failure instead halt this
      // streamie outright (see handleConsumerHalted), unless keepAlive opted out.
      // (A sink never reaches here: its outputs skip the queue, so length above is
      // always 0.)
      (outputStreamies.size === 0) ||
      // TODO should allow different strategies, but for now we will say that if any consumer
      // is backpressured, no other outputStreamies will be pushed to, as this could allow a queue
      // to grow indefinitely.
      (Array.from(outputStreamies).some((consumer) => consumer.state.backpressure.input))
    ) return { canProcess: false };
    return { canProcess: true };
  }

  function requestProcess() {
    // A pending yield is a deliberate pause: re-entering here (from pushes, event
    // subscriptions, promise continuations) before the macrotask fires would erode
    // the yield one item at a time, so processing requests during the window are
    // simply absorbed — the yield's own continuation resumes them. Meanwhile the
    // input queue keeps accepting items, so backpressure builds and cooperative
    // producers park exactly as if processing were merely busy.
    if (ref.yieldScheduled) return;
    let activity = true;
    while (activity) {
      activity = false;
      const { canProcess: canProcessInput, scheduleRetryIn } = checkCanProcessInput();
      if (scheduleRetryIn) {
        const timeoutId = setTimeout(() => {
          requestProcess();
          ref.timeouts.delete(timeoutId);
        }, scheduleRetryIn);
        ref.timeouts.add(timeoutId);
      }

      if (canProcessInput) {
        activity = true;

        // Synchronous handlers settle inline (processInput returns undefined) and the
        // loop simply continues. Asynchronous handlers are not awaited, to allow for
        // parallel processing of input items; resuming via .then here rather than
        // recursively inside processInput keeps large input queues from causing a
        // stack overflow.
        const pending = processInput();
        if (pending) pending.then(() => requestProcess());
      }
      if (checkCanProcessOutput().canProcess) {
        activity = true;

        // Attempt to clear output.
        while (checkCanProcessOutput().canProcess) {
          // We don't await this because we want to allow for parallel processing of output items and
          // resume processing input items as soon as possible.
          processOutput();
        }
      }

      // Time-based yield, checked only after an iteration that did work: handlers
      // that settle without real I/O or timers (synchronous, or async over
      // already-settled promises) chain processing through microtasks indefinitely,
      // and a starved event loop cannot run timers — including any timer that would
      // have called abort(). The age of the current event-loop slice (time since
      // the last macrotask boundary; see the util) is the starvation actually in
      // progress, so a healthy turning loop never trips this. The budget bounds
      // starvation to roughly yieldAfter plus a single handler invocation, which is
      // the strongest guarantee available: nothing can preempt one synchronous
      // handler.
      if (activity && (currentSliceAge(lastClockAt) >= settings.yieldAfter)) {
        return scheduleYield();
      }
    }

    if (state.isDrained) handleOnDrained();
  }

  // Defers the next processing pass to a macrotask, letting the event loop turn
  // over (timers, I/O) before work resumes — which also ends the current event-loop
  // slice, so resumed processing measures against a fresh clock.
  function scheduleYield() {
    if (ref.yieldScheduled) return;
    ref.yieldScheduled = true;
    yieldToMacrotask(() => {
      ref.yieldScheduled = false;
      requestProcess();
    });
  }

  // Defers processing to a microtask. External pushes use this rather than processing
  // synchronously so that a synchronous handler can't process (and flush outputs past)
  // consumers that are attached later in the same synchronous block as the push.
  function scheduleProcess() {
    if (ref.processScheduled) return;
    ref.processScheduled = true;
    queueMicrotask(() => {
      ref.processScheduled = false;
      requestProcess();
    });
  }

  function handleOnError(queueError: StreamieQueueError<I>) {
    state.lastError = queueError;
    // If this stream is configured to haltOnError, then its own promise
    // will have registered an error listener to reject the promise, which
    // will be invoked here.
    eventHandlers.error.emit(queueError);

    if (settings.propagateErrors) {
      outputStreamies.forEach((consumer) => {
        consumer._pushQueueError(queueError);
      });
    }

    // Important to do this at the end so errors can be handled before children
    // are removed from halting
    if (settings.haltOnError) setHalted();
  }

  function handleOnDrained() {
    if (!state.isDrained) return;

    ref.timeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    ref.timeouts.clear();

    // The drained event latches, so reaching this from multiple paths (every
    // requestProcess cycle once drained, plus drain() itself) fires it only once.
    eventHandlers.drained.emit();
  }

  function setHalted() {
    if (state.isHalted) return;
    state.isHalted = true;
    // A halt abandons whatever is still queued, so any receipts held for those items
    // would otherwise never settle, deadlocking their awaiters. Reject them with the
    // same error the streamie's promise rejects with. In-flight invocations are
    // unaffected: their receipts were dequeued with their items and settle on their
    // own. (This leaves the receipt queue empty while the input queue is not, but a
    // halted streamie never dequeues input again, so the alignment is moot.)
    if (queue.receipt !== null) {
      const error = state.isAborted
        ? (state.abortError === undefined ? new Error('Streamie was aborted.') : state.abortError)
        : (state.lastError ?? new Error('Streamie was halted.'));
      while (queue.receipt.length > 0) {
        queue.receipt.shift()?._reject(error);
      }
    }
    eventHandlers.halted.emit({
      isAborted: state.isAborted,
      abortError: state.abortError,
      lastError: state.lastError,
    });
  }


  // Public functions
  function push(item: I): PushReceipt<OutputItem> {
    if (state.isHalted) throw new Error('Cannot push to a halted streamie.');
    if (state.shouldDrain) throw new Error(`Cannot push to a ${ state.isDrained ? 'drained' : 'draining'} streamie.`);

    // Receipt tracking activates on the first push rather than up front, so that
    // streamies fed only by upstream streamies never pay for it. Items already queued
    // at activation (delivered via _receive) have no receipts, so their slots are
    // backfilled with undefined to establish the slot-for-slot alignment with the
    // input queue that processInput relies on.
    if (queue.receipt === null) {
      queue.receipt = new RingBuffer();
      for (let i = queue.input.length; i > 0; i--) queue.receipt.push(undefined);
    }

    queue.input.push(item);
    const receipt = new PushReceipt<OutputItem>(state.backpressure.input);
    queue.receipt.push(receipt);

    scheduleProcess();
    return receipt;
  }

  function withInheritedDefaults(config: Config): Config {
    return {
      ...config,
      haltOnError: config.haltOnError ?? settings.haltOnError,
    };
  }

  function map<NR>(
    handler: Handler<OutputItem, NR>,
    config: Config = {},
  ): Streamie<OutputItem, Awaited<NR>> {
    const nextStreamie = streamie(handler, withInheritedDefaults(config));

    registerOutput(nextStreamie);

    return nextStreamie;
  }

  // A .map that is also a terminal stage: the handler is the endpoint (a forEach),
  // so its outputs are discarded as they settle and consumers cannot be registered.
  // This is how a pipeline of side effects declares "the end of the line is here" —
  // without it, the final stage would retain its outputs and stall on backpressure.
  function each<NR>(
    handler: Handler<OutputItem, NR>,
    config: Config = {},
  ): Streamie<OutputItem, Awaited<NR>> {
    return map(handler, { ...config, sink: true });
  }

  // An explicit terminal stage with nothing left to do: an identity .each. A
  // pipeline of pure transforms ends with .sink() to declare that reaching the end
  // is the point, letting the chain drain rather than retain its final outputs.
  function sink(config: Config = {}): Streamie<OutputItem, OutputItem> {
    // The cast collapses Awaited<OutputItem> to OutputItem: outputs are already
    // settled values, but TS cannot reduce Awaited over the unresolved generic.
    return each((item: OutputItem) => item, config) as Streamie<OutputItem, OutputItem>;
  }

  // NOTE: filtering (dropping items) is implemented by the core process loop, not here.
  // Don't be tempted to move it out into this function: the handler contract is one
  // output enqueued per invocation, so a handler-based filter has no way to emit zero
  // outputs for an input. Only the core can decide per-item whether anything reaches
  // the output queue.
  function filter(
    handler: FilterHandler<OutputItem>,
    config: Config = {},
  ): Streamie<OutputItem, OutputItem> {
    const nextStreamie = streamie(
      handler as Handler<OutputItem, unknown>,
      { ...withInheritedDefaults(config), isFilter: true } as InternalConfig,
    ) as unknown as Streamie<OutputItem, OutputItem>;

    registerOutput(nextStreamie);

    return nextStreamie;
  }

  // NOTE: batching is implemented by the core process loop, not here. Don't be tempted
  // to move it out into this function: a standalone batcher built on the public API
  // can't flush a partial batch once a drain has begun (push throws while draining),
  // would have to duplicate the maxBatchWait timer scheduling, and items accumulated
  // outside an input queue would be invisible to backpressure. Past attempts to
  // extract it ended up reimplementing the process loop.
  function batch(
    batchSize: number,
    config: BatchConfig = {},
  ): Streamie<OutputItem, OutputItem[]> {
    if (!Number.isInteger(batchSize) || (batchSize < 1)) throw new Error('batchSize must be a positive integer.');

    // With a batchSize of 1 the core hands the handler a bare item rather than an
    // array, so it gets wrapped here to honor the O[] output type.
    const handler = batchSize === 1
      ? (item: OutputItem) => [item]
      : (items: OutputItem[]) => items;
    const nextStreamie = streamie(
      handler as Handler<OutputItem, OutputItem[]>,
      { ...withInheritedDefaults(config), batchSize } as InternalConfig,
    ) as unknown as Streamie<OutputItem, OutputItem[]>;

    registerOutput(nextStreamie as unknown as Streamie<OutputItem, any>);

    return nextStreamie;
  }

  // NOTE: flattening is implemented by the core process loop, not here. Don't be
  // tempted to move it out into this function: emitting multiple outputs per input
  // requires writing to the output queue directly, which the one-output-per-invocation
  // handler contract can't express; a handler-based flatten would need its own queue
  // and drain handling.
  function flatten(config: Config = {}): Streamie<OutputItem, any> {
    const nextStreamie = streamie(
      ((item: OutputItem) => item) as Handler<OutputItem, unknown>,
      { ...withInheritedDefaults(config), flatten: true } as InternalConfig,
    ) as unknown as Streamie<OutputItem, any>;

    registerOutput(nextStreamie);

    return nextStreamie;
  }

  // TODO add reduce, flatMap, etc.

  function pause(shouldPause?: boolean) {
    state.isPaused = shouldPause ?? !state.isPaused;
    if (!state.isPaused) requestProcess();
  }

  // Terminates the streamie abnormally through the same halt machinery as
  // haltOnError, but marks the termination as externally imposed and records the
  // (arbitrary) error it was imposed with. Idempotent and a no-op once the streamie
  // is already terminal — unlike push, a termination signal arriving late is not a
  // caller bug (matching AbortController.abort()).
  function abort(error?: unknown) {
    if (state.isHalted || state.isDrained) return;
    state.isAborted = true;
    state.abortError = error;
    setHalted();
  }

  function drain() {
    if (state.shouldDrain) return;
    state.shouldDrain = true;
    eventHandlers.draining.emit();
    // If there is nothing queued or in flight, the streamie is already drained and the
    // event can fire immediately. This matters for synchronous pipelines, where all
    // processing may already have completed by the time a drain cascades down from
    // upstream, leaving no later requestProcess to notice the drained state.
    if (state.isDrained) return handleOnDrained();
    // Otherwise move to the next tick to allow for a final push to the output queue. Items
    // can still be pushed to the output queue while draining, but if the streamie were
    // considered drained immediately upon draining, the onDrained event would fire before
    // the final push to the output.
    setTimeout(() => requestProcess());
  }

  // This registers an input streamie, so that this streamie can be triggered to drain
  // (or, when every input aborted, to abort) once all of its input streamies have
  // terminated.
  function registerInput(inputStreamie: Streamie<any, I>) {
    if (state.isDrained) throw new Error('Cannot register an input on a drained streamie.');
    if (inputStreamie.state.isDrained) throw new Error('Cannot register a drained streamie as an input.');
    if (state.isHalted) throw new Error('Cannot register an input on a halted streamie.');
    if (inputStreamie.state.isHalted) throw new Error('Cannot register a halted streamie as an input.');
    if (inputStreamies.has(inputStreamie)) return;
    inputStreamies.add(inputStreamie);

    inputStreamie.onDrained(handleInputTerminated);
    inputStreamie.onHalted(({ isAborted, abortError }) => {
      inputStreamies.delete(inputStreamie);
      if (isAborted) inputAbortErrors.push(abortError);
      else hasNonAbortHaltedInput = true;
      handleInputTerminated();
    });

    inputStreamie.registerOutput(self);
  }

  function handleInputTerminated() {
    // Halted inputs are removed from the set on termination, so "all inputs have
    // terminated" is "every input still present has drained" — vacuously true when
    // every input halted.
    if (!Array.from(inputStreamies).every((inputStreamie) => inputStreamie.state.isDrained)) return;
    // An abort cascades only when every feeder aborted: any input that drained (still
    // in the set) or halted on its own error means there was a non-aborted data path,
    // and the termination is an ordinary drain of whatever arrived. This is a
    // deliberate default — one feeder of several aborting shouldn't kill a consumer
    // that other feeders completed normally.
    if (inputStreamies.size > 0 || inputAbortErrors.length === 0 || hasNonAbortHaltedInput) {
      return drain();
    }
    const errors = inputAbortErrors.filter((error) => error !== undefined);
    abort(errors.length > 1 ? new AggregateError(errors, 'All input streamies aborted.') : errors[0]);
  }

  function registerOutput(outputStreamie: Streamie<OutputItem, any>) {
    // A sink is a declared endpoint: its outputs are discarded as they settle (they
    // never reach an output queue), so a consumer of one could only ever observe
    // nothing. Refusing the registration outright beats silently delivering nothing.
    if (settings.isSink) throw new Error('Cannot register an output on a sink streamie.');
    if (state.isDrained) throw new Error('Cannot register an output on a drained streamie.');
    if (outputStreamie.state.isDrained) throw new Error('Cannot register a drained streamie as an output.');
    if (state.isHalted) throw new Error('Cannot register an output on a halted streamie.');
    if (outputStreamie.state.isHalted) throw new Error('Cannot register a halted streamie as an output.');
    if (outputStreamies.has(outputStreamie)) return;
    outputStreamies.add(outputStreamie);
    // A consumer that halts or drains is no longer ours to feed: it is removed, and
    // every subscription this registration placed on it is torn down with it, so a
    // long-lived streamie neither accumulates dead listeners nor retains departed
    // consumers' closures as consumers come and go (e.g. repeated short-lived async
    // iterations of one source).
    const consumerSubscriptions: Unsubscribe[] = [];
    const removeOutput = () => {
      outputStreamies.delete(outputStreamie);
      while (consumerSubscriptions.length > 0) consumerSubscriptions.pop()!();
    };
    consumerSubscriptions.push(outputStreamie.onBackpressureRelease(() => requestProcess()));
    consumerSubscriptions.push(outputStreamie.onHalted((haltPayload) => {
      removeOutput();
      handleConsumerHalted(haltPayload);
    }));
    // Removal on draining would be a strange scenario, but it's not disallowed: if a
    // streamie with inputs is set to drain, we simply remove it as an output.
    consumerSubscriptions.push(outputStreamie.onDraining(removeOutput));

    outputStreamie.registerInput(self);

    // A streamie with no consumers retains its outputs (see checkCanProcessOutput),
    // so a late-attaching consumer may have a backlog waiting; nudge the loop to
    // flush it. Deferred to a microtask so a registration mid-chain-construction
    // can't deliver outputs past consumers attached later in the same block.
    scheduleProcess();
  }

  // Invoked when a consumer halts (after its removal from outputStreamies). When
  // that halt emptied the consumer set, every path this streamie's outputs could
  // take now ends in a failure, so it halts too. This is how downstream failure
  // propagates upstream — the inverse of the abort cascade — and it is transitive
  // by induction: aborting here makes *this* streamie a halted consumer of its own
  // inputs, which apply the same rule, all the way up to the source (releasing, for
  // a stream bridge, the underlying reader). The emptied-by-a-halt requirement is
  // load-bearing in both directions: one consumer failing never kills a source a
  // sibling is still consuming, and voluntary detaches (a drain, an async iterator
  // break) never trigger this — those leave a healthy streamie retaining its
  // outputs for any later consumer.
  function handleConsumerHalted(haltPayload: StreamieHaltPayload<OutputItem>) {
    if (outputStreamies.size > 0) return;
    // The opt-out for deliberately long-lived sources (hubs) whose ephemeral
    // consumers come, fail, and are replaced: retain outputs and park on
    // backpressure instead, exactly as if the consumers had detached voluntarily.
    if (settings.keepAlive) return;
    // Already terminal: the consumer's halt may be the echo of this streamie's own
    // abort cascading downstream. (A merely *draining* streamie is not exempt: its
    // remaining outputs now have nowhere to go, so without the abort its promise
    // would hang rather than ever resolve.)
    if (state.isHalted || state.isDrained) return;
    // abort() rather than a bespoke halt: externally imposed termination is exactly
    // what abort models, with the consumer's terminating error — its own abort
    // error, or the handler error that halted it — as the cause. Upstream stages
    // thus report isAborted: true, to be read as "halted from outside its own
    // handlers", while the root error is preserved through every hop.
    abort(haltPayload.isAborted ? haltPayload.abortError : haltPayload.lastError ?? undefined);
  }

  // Private functions

  // This is to allow upstream streamies to propagate errors. Should not be invoked for
  // another reason. We can't know the type generics because it could have been passed
  // from a parent of a parent, etc.
  function _pushQueueError(error: StreamieQueueError<any>) {
    // TODO maybe at some point we should distinguish between whether "shouldPropagateErrors"
    // means "should I pass my errors on" vs "should I allow other errors to be passed on to me"
    if (settings.propagateErrors) handleOnError(error);
  }

  // The delivery path used by upstream streamies. Identical to push except that it
  // processes synchronously, preserving the existing in-flight timing between connected
  // streamies; the microtask deferral in push only exists to protect external callers
  // using synchronous handlers (see scheduleProcess).
  function _receive(...items: I[]) {
    if (state.isHalted) throw new Error('Cannot push to a halted streamie.');
    if (state.shouldDrain) throw new Error(`Cannot push to a ${ state.isDrained ? 'drained' : 'draining'} streamie.`);

    for (let i = 0; i < items.length; i++) queue.input.push(items[i]);
    // Items delivered by upstream streamies have no receipts (nobody holds a handle
    // to them), but once receipt tracking is active they still occupy slots to keep
    // the two queues aligned.
    if (queue.receipt !== null) {
      for (let i = 0; i < items.length; i++) queue.receipt.push(undefined);
    }
    requestProcess();
  }

  const self = {
    push,
    map,
    each,
    filter,
    batch,
    flatten,
    sink,

    pause,
    drain,
    abort,

    // Reports whether this streamie is a batching stage (created via .batch). With no
    // argument: whether a batch size was configured at all — true even for .batch(1),
    // which emits single-element arrays and is observably distinct from an unbatched
    // streamie. With an argument: whether the configured batch size is exactly that
    // value. An unbatched streamie reports false for every query.
    isBatched: (batchSize?: number) =>
      batchSize === undefined
        ? settings.configuredBatchSize !== null
        : settings.configuredBatchSize === batchSize,

    registerInput,
    registerOutput,

    state: {
      get backpressure() {
        return state.backpressure;
      },
      get count() {
        return {
          started: state.count.started,
          handling: state.count.handling,
          queued: {
            get input() { return queue.input.length; },
            get output() { return queue.output.success.length; },
          },
        };
      },
      get isPaused() {
        return state.isPaused;
      },
      get isDrained() {
        return state.isDrained;
      },
      get isHalted() {
        return state.isHalted;
      },
      get isAborted() {
        return state.isAborted;
      },
      // The configured batch size: null when unbatched, the size passed to .batch
      // otherwise (including 1). This is intent, not the internal dequeue count.
      get batchSize() {
        return settings.configuredBatchSize;
      },
    },

    // The subscription side of the lifecycle events: each is callable to attach a
    // handler (returning an unsubscribe) and carries .once for self-removing
    // handlers. The latching events handle already-transitioned subscribers
    // themselves, so no state checks are needed here.
    onBackpressureRelease: eventHandlers.backpressureRelease.on,
    onDrained: eventHandlers.drained.on,
    onDraining: eventHandlers.draining.on,
    onError: eventHandlers.error.on,
    onHalted: eventHandlers.halted.on,

    [Symbol.asyncIterator]: () => createAsyncIterator(registerOutput, state),

    _pushQueueError,
    _receive,

    // The reason this is a getter is because most streamies in a pipeline will not
    // actually be awaited, most likely just the last one. If we create promises
    // for all of them, even those that aren't being used, then they will all have
    // unhandled promise rejections in the event of an error.
    get promise() {
      if (ref.externalPromise) return ref.externalPromise;

      // We create a new promise wrapping the internal promise so that, while we've
      // auto "handled" the internal promise catch, this new promise will still issue
      // an unhandled rejection error if the external promise is actually unhandled.
      return ref.externalPromise = new Promise<null>((resolve, reject) => {
        ref.internalPromise.then(() => resolve(null)).catch(reject);
      });
    },
  } as unknown as Streamie<I, OutputItem>;

  if (config.seed !== undefined) setTimeout(() => {
    if (state.isDrained) return;
    self.push(config.seed!)
  }, 0);

  return self;
}

// WHATWG (web) stream bridges. The Streamie-suffixed names matter: the bare
// Readable/Writable names belong to Node's stream classes, whose bridges live apart
// so that node:stream never touches this entry.

// Creates a streamie fed by a WHATWG ReadableStream. Items flow under backpressure
// (the stream is only pulled as fast as the pipeline absorbs items, bounded by
// backpressureAt); the stream ending drains the streamie, the stream erroring aborts
// it with that error, and the streamie terminating cancels the stream's reader.
// Because downstream failure cascades upstream through the core (a consumer halt
// that leaves a streamie consumer-less aborts it, transitively), a failure at *any*
// depth in the pipeline reaches the bridge and cancels the reader with the root
// error — the source-cancellation contract of pipeTo across a pipeThrough chain.
// preventCancel: true (pipeTo's option) keeps the stream itself out of it: the
// bridge streamie still halts, but the reader lock is released without cancelling,
// leaving the stream readable by another consumer.
// The chunk type is recovered via ReadableStreamChunkOf (see its comment for why
// inference can't run through ReadableStreamLike<T> directly), and the output is its
// Awaited because handler results are awaited: a stream of thenables emits their
// settled values (for any ordinary chunk type both are just the chunk type).
export function fromReadableStream<S extends ReadableStreamLike<unknown>>(
  stream: S,
  config: Pick<Config, 'backpressureAt' | 'yieldAfter'> & { preventCancel?: boolean } = {},
): Streamie<ReadableStreamChunkOf<S>, Awaited<ReadableStreamChunkOf<S>>> {
  type T = ReadableStreamChunkOf<S>;
  const bridged = streamie((input: T) => input, config);
  pumpReadableStream(stream as ReadableStreamLike<T>, bridged, { preventCancel: config.preventCancel });
  return bridged;
}

export { default as toWritableStream } from './utils/streams/writable';
export type { ReadableStreamLike, WritableStreamLike } from './utils/streams';

// Types
import { StreamieQueueError } from './error';
import { Streamie, Handler, Config, BatchedIfConfigured, UnflattenedIfConfigured, BooleanIfFilter, OutputIsInputIfFilter, IfFilteredElse } from './types';

// Validation
import * as validate from './validation';

export default function streamie<
  IQT extends any,
  OQT extends IfFilteredElse<
    // If the streamie is a filter, the output queue type is the input to the handler.
    // We need to account for the possibility that the input to the handler is batched.
    BatchedIfConfigured<IQT, C>,
    any,
    C
  >,
  const C extends Config,
>(
  handler: Handler<IQT, OQT, C>,
  config: C & {
    // When calling streamie directly, we allow a seed value to be passed
    seed?: IQT;
  },
) {
  const queue: {
    input: IQT[];
    output: {
      // A queue pairing the input items with their handler output.
      success: {
        // We always pair the input of the handler with the queue output,
        // regardless of whether the output has been flattened or not.
        // The input of the handler may or may not have been batched.
        input: BatchedIfConfigured<IQT, C>;
        // Output is always the OQT, but not always the direct return value
        // of the handler. If the streamie is flattened, the handler output
        // is an array, and will be OQT[]. If the streamie is filtered, the
        // return value of the handler is a boolean, and OQT will be equal to
        // IQT, or IQT[] if the streamie is batched.
        output: OQT;
      }[];
    };
  } = {
    // TODO make these linked lists
    input: [],
    output: {
      success: [],
    },
  };

  const settings = {
    backpressureAt: validate.backpressureAt(config),
    concurrency: config.concurrency || 1,
    batchSize: config.batchSize || 1,
    maxBatchWait: config.maxBatchWait || Infinity,
    isFilter: config.isFilter === true,
    haltOnError: config.haltOnError !== false,
    flatten: config.flatten === true,
    propagateErrors: config.propagateErrors !== false,
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
    hasHandledOnDrained: boolean;
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
        return (queue.output.success.length + state.count.handling) >= settings.backpressureAt.output;
      },
    },
    get isDrained() {
      return state.shouldDrain && (queue.input.length === 0) && (state.count.handling === 0) && (queue.output.success.length === 0);
    },
    shouldDrain: false,
    isPaused: false,
    isHalted: false,
    hasHandledOnDrained: false,
  };

  const outputStreamies: Set<Streamie<OQT, any, any>> = new Set();
  const inputStreamies: Set<Streamie<any, IQT, any>> = new Set();

  const eventHandlers: {
    onBackpressureRelease: Set<() => void>;
    onDrained: Set<() => void>;
    onDraining: Set<() => void>;
    onError: Set<(error: StreamieQueueError<IQT, C>) => void>;
    onHalted: Set<() => void>;
  } = {
    onBackpressureRelease: new Set(),
    onDrained: new Set(),
    onDraining: new Set(),
    onError: new Set(),
    onHalted: new Set(),
  };

  let maxBatchWaitTimeout: NodeJS.Timeout | null = null;

  // Internal functions
  async function processInput() {
    if (state.isPaused || state.isHalted || state.isDrained) return;
    if (queue.input.length === 0) return;
    if (state.backpressure.output) return;
    const timeSinceLastHandled = state.lastHandledAt && Date.now() - state.lastHandledAt;

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
        if (settings.maxBatchWait && (settings.maxBatchWait !== Infinity)) {
          if (maxBatchWaitTimeout) clearTimeout(maxBatchWaitTimeout);
          maxBatchWaitTimeout = setTimeout(() => {
            requestProcessInput();
          }, settings.maxBatchWait - (timeSinceLastHandled || 0));
        }
        return;
      }
    }
    if (state.count.handling >= settings.concurrency) return;

    const startedWithBackpressure = state.backpressure.input;

    state.lastHandledAt = Date.now();
    state.count.handling++;
    const itemsToHandle = queue.input.splice(0, settings.batchSize);
    const handlerInput = (settings.batchSize === 1 ? itemsToHandle[0] : itemsToHandle) as BatchedIfConfigured<IQT, C>;

    // Since we're in a valid state to process items and we're not yet at concurrency limit,
    // we begin another attempt to process items.
    requestProcessInput();

    if (startedWithBackpressure && !state.backpressure.input) {
      eventHandlers.onBackpressureRelease.forEach((eventHandler) => {
        eventHandler();
      });
    }

    const index = state.count.started++;

    try {
      const handlerOutput: BooleanIfFilter<UnflattenedIfConfigured<OQT, C>, C> = await handler(
        handlerInput, {
          self,
          push: self.push,
          index,
        },
      );

      // Only wrapped in an IIFE to allow for early returns.
      (() => {
        // If the handler is a filter, the return value is a boolean, and if the return value is false, we
        // do not push to the output queue. If the output is truthy, we pass the input through to
        // the output queue.
        if (settings.isFilter) {
          if (!handlerOutput) return; // Handler returned false, so we do not push anything to the output queue.
          const filterOutput = handlerInput; // Handler returned true, so we push the input to the output queue.
          const successQueue = queue.output.success as { input: BatchedIfConfigured<IQT, C>, output: BatchedIfConfigured<IQT, C> }[];
          if (!settings.flatten) {
            return successQueue.push({ input: handlerInput, output: filterOutput });
          }
          if (!Array.isArray(handlerInput)) throw new Error('Cannot flatten input that is not an array.');
          // At this point we are flattening either an array of inputs that are arrayed due to batching, or
          // the input is itself an array. We don't care which, we just want to flatten it. Adding additional
          // conditionals to check batchSize just to improve the typing from any[] is not worth actually adding
          // actual complexity to the runtime code.
          return successQueue.push(...(filterOutput as any[]).map((input) => ({ input, output: input })));
        }

        const successQueue = queue.output.success as { input: BatchedIfConfigured<IQT, C>, output: OQT }[];
        if (settings.flatten) {
          if (!Array.isArray(handlerOutput)) throw new Error('Cannot flatten output that is not an array.');
          successQueue.push(...(handlerOutput as OQT[]).map((output) => ({ input: handlerInput, output })));
        }
        else successQueue.push({ input: handlerInput, output: handlerOutput as OQT });
      })();
    } catch (err) {
      const queueError = new StreamieQueueError(
        // @ts-ignore
        `Encountered an error while processing input: ${err?.message || ''}`,
        err,
        {
          input: handlerInput,
          index,
          timestamp: Date.now(),
        },
      );

      handleOnError(queueError);
    }
    state.count.handling--;

    requestProcessOutput();
    requestProcessInput();
  }

  function processOutput() {
    if (state.isPaused || state.isHalted || state.isDrained) return;
    if (queue.output.success.length === 0) return;
    // TODO should allow different strategies, but for now we will say that if any consumer
    // is backpressured, no other outputStreamies will be pushed to, as this could allow a queue
    // to grow indefinitely.
    if (Array.from(outputStreamies).some((consumer) => consumer.state.backpressure.input)) return;

    const success = queue.output.success.shift();
    outputStreamies.forEach((consumer) => {
      consumer.push(success!.output);
    });

    requestProcessOutput();
    requestProcessInput();
  }


  async function requestProcessInput() {
    // Allow this to be more complicated logic in future.
    await processInput();

    if (state.isDrained) handleOnDrained();
  }

  async function requestProcessOutput() {
    // Allow this to be more complicated logic in future.
    await processOutput();

    if (state.isDrained) handleOnDrained();
  }

  function handleOnError(queueError: StreamieQueueError<IQT, C>) {
    // If this stream is configured to haltOnError, then its own promise
    // will have registered on onError listener to reject the promise, which
    // will be invoked here.
    eventHandlers.onError.forEach((eventHandler) => {
      eventHandler(queueError);
    });

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
    if (!state.isDrained || state.hasHandledOnDrained) return;
    state.hasHandledOnDrained = true;
    eventHandlers.onDrained.forEach((eventHandler) => {
      eventHandler();
    });
  }

  function setHalted() {
    if (state.isHalted) return;
    state.isHalted = true;
    eventHandlers.onHalted.forEach((eventHandler) => {
      eventHandler();
    });
  }


  // Public functions
  function push(...items: IQT[]) {
    if (state.isHalted) throw new Error('Cannot push to a halted streamie.');
    if (state.shouldDrain) throw new Error(`Cannot push to a ${ state.isDrained ? 'drained' : 'draining'} streamie.`);

    queue.input.push(...items);
    requestProcessInput();
  }


  function map<
    NOQT extends IfFilteredElse<
      BatchedIfConfigured<OQT, NC>,
      any,
      NC
    >,
    NC extends Config
  >(
    handler: Handler<OQT, NOQT, NC>,
    config: NC,
  ): Streamie<OQT, NOQT, NC> {
    const nextStreamie = streamie(handler, config) as Streamie<OQT, NOQT, NC>;

    registerOutput(nextStreamie);

    return nextStreamie;
  }

  function filter<NC extends Omit<Config, 'isFilter'>>(
    handler: Handler<OQT, boolean, NC>,
    config: NC,
  ): Streamie<OQT, BatchedIfConfigured<OQT, NC>, NC> {
    const nextStreamie = map(
      // @ts-ignore
      handler,
      { ...config, isFilter: true },
    ) as Streamie<OQT, BatchedIfConfigured<OQT, NC>, NC>;
    return nextStreamie;
  }

  // TODO add reduce, flatMap, etc.

  function pause(shouldPause?: boolean) {
    state.isPaused = shouldPause ?? !state.isPaused;
    if (!state.isPaused) requestProcessInput();
  }

  function drain() {
    if (state.shouldDrain) return;
    state.shouldDrain = true;
    eventHandlers.onDraining.forEach((eventHandler) => eventHandler());
    // Move to next tick to allow for a final push to output queue. Items can still be pushed
    // to the output queue while draining, but if the streamie is considered drained immediately
    // upon draining, then the onDrained event will be fired before the final push to the output.
    setTimeout(() => requestProcessInput());
  }

  // This registers an input streamie, so that this streamie can be triggered to drain
  // in the event that all of its input streamies are drained.
  function registerInput(inputStreamie: Streamie<any, IQT, any>) {
    if (state.isDrained) throw new Error('Cannot register an input on a drained streamie.');
    if (inputStreamie.state.isDrained) throw new Error('Cannot register a drained streamie as an input.');
    if (state.isHalted) throw new Error('Cannot register an input on a halted streamie.');
    if (inputStreamie.state.isHalted) throw new Error('Cannot register a halted streamie as an input.');
    if (inputStreamies.has(inputStreamie)) return;
    inputStreamies.add(inputStreamie);

    inputStreamie.onDrained(drainIfAllInputsDrained);
    inputStreamie.onHalted(() => {
      inputStreamies.delete(inputStreamie);
      drainIfAllInputsDrained();
    });

    inputStreamie.registerOutput(self);

    function drainIfAllInputsDrained() {
      if (Array.from(inputStreamies).every((inputStreamie) => inputStreamie.state.isDrained)) {
        drain();
      }
    }
  }

  function registerOutput(outputStreamie: Streamie<OQT, any, any>) {
    if (state.isDrained) throw new Error('Cannot register an output on a drained streamie.');
    if (outputStreamie.state.isDrained) throw new Error('Cannot register a drained streamie as an output.');
    if (state.isHalted) throw new Error('Cannot register an output on a halted streamie.');
    if (outputStreamie.state.isHalted) throw new Error('Cannot register a halted streamie as an output.');
    if (outputStreamies.has(outputStreamie)) return;
    outputStreamies.add(outputStreamie);
    outputStreamie.onBackpressureRelease(() => requestProcessOutput());
    outputStreamie.onHalted(() => outputStreamies.delete(outputStreamie));

    // This would be a strange scenario, but it's not disallowed. If a streamie
    // with inputs is set to drain, we simply remove it as an output.
    outputStreamie.onDraining(() => outputStreamies.delete(outputStreamie));

    outputStreamie.registerInput(self);
  }

  function onBackpressureRelease(eventHandler: () => void) {
    eventHandlers.onBackpressureRelease.add(eventHandler);
  }

  function onDrained(eventHandler: () => void) {
    if (state.isDrained) return eventHandler();
    eventHandlers.onDrained.add(eventHandler);
  }

  function onDraining(eventHandler: () => void) {
    if (state.shouldDrain) return eventHandler();
    eventHandlers.onDraining.add(eventHandler);
  }

  function onError(eventHandler: (error: StreamieQueueError<IQT, C>) => void) {
    eventHandlers.onError.add(eventHandler);
  }

  function onHalted(eventHandler: () => void) {
    if (state.isHalted) return eventHandler();
    eventHandlers.onHalted.add(eventHandler);
  }

  // Private functions

  // This is to allow upstream streamies to propagate errors. Should not be invoked for
  // another reason. We can't know the type generics because it could have been passed
  // from a parent of a parent, etc.
  function _pushQueueError(error: StreamieQueueError<any, any>) {
    // TODO maybe at some point we should distinguish between whether "shouldPropagateErrors"
    // means "should I pass my errors on" vs "should I allow other errors to be passed on to me"
    if (settings.propagateErrors) handleOnError(error);
  }

  const self = {
    push,
    map,
    filter,

    pause,
    drain,

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
    },

    onBackpressureRelease,
    onDrained,
    onDraining,
    onError,
    onHalted,

    _pushQueueError,

    promise: new Promise((resolve, reject) => {
      onDrained(() => resolve(null));

      if (settings.haltOnError) onError((error) => reject(error));
    }),
  } satisfies Streamie<IQT, OQT, C>;

  if (config.seed !== undefined) setTimeout(() => self.push(config.seed!), 0);

  return self;
}

import { Streamie, Handler, Config, BatchedIfConfigured, UnflattenedIfConfigured, BooleanIfFilter, OutputIsInputIfFilter, IfFilteredElse } from './types';

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
  config: C,
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
    input: [],
    output: {
      success: [],
    },
  };

  const settings = {
    backpressureAt: config.backpressureAt || Infinity,
    concurrency: config.concurrency || 1,
    batchSize: config.batchSize || 1,
    maxBatchWait: config.maxBatchWait || Infinity,
    isFilter: config.isFilter || false,
    haltOnError: config.haltOnError || false,
    flatten: config.flatten || false,
  };

  const state: {
    count: {
      started: number;
      handling: number;
    };
    lastHandledAt: number | null;
    backpressure: boolean;
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
    get backpressure() {
      // We base backpressure off of the output queue. This also takes into account child
      // streamies, as their own backpressure will prevent the output queue from outputting,
      // and will cause it to exceed this threshold.
      return queue.output.success.length >= settings.backpressureAt;
    },
    get isDrained() {
      return state.shouldDrain && (queue.input.length === 0) && (state.count.handling === 0) && (queue.output.success.length === 0);
    },
    shouldDrain: false,
    isPaused: false,
    isHalted: false,
    hasHandledOnDrained: false,
  };

  const consumers: Streamie<OQT, any, any>[] = []
  const inputStreamies: Streamie<any, any, any>[] = [];

  const eventHandlers: {
    onBackpressureRelease: Set<() => void>;
    onDrained: Set<() => void>;
    onError: Set<(payload: { input: BatchedIfConfigured<IQT, C>, error: any }) => void>;
  } = {
    onBackpressureRelease: new Set(),
    onDrained: new Set(),
    onError: new Set(),
  };

  let maxBatchWaitTimeout: NodeJS.Timeout | null = null;

  // Internal functions
  async function processInput() {
    if (state.isPaused || state.isHalted || state.isDrained) return;
    if (queue.input.length === 0) return;
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

    const startedWithBackpressure = state.backpressure;

    state.lastHandledAt = Date.now();
    state.count.handling++;
    const itemsToHandle = queue.input.splice(0, settings.batchSize);
    const handlerInput = (settings.batchSize === 1 ? itemsToHandle[0] : itemsToHandle) as BatchedIfConfigured<IQT, C>;

    // Since we're in a valid state to process items and we're not yet at concurrency limit,
    // we begin another attempt to process items.
    requestProcessInput();

    if (startedWithBackpressure && !state.backpressure) {
      eventHandlers.onBackpressureRelease.forEach((eventHandler) => {
        eventHandler();
      });
    }

    try {
      const handlerOutput: BooleanIfFilter<UnflattenedIfConfigured<OQT, C>, C> = await handler(
        handlerInput, {
          self,
          push: self.push,
          index: state.count.started++,
        },
      );


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
      if (settings.haltOnError) state.isHalted = true;
      eventHandlers.onError.forEach((eventHandler) => {
        eventHandler({ input: handlerInput, error: err });
      });
    }
    state.count.handling--;

    requestProcessOutput();
    requestProcessInput();
  }

  function processOutput() {
    if (state.isPaused || state.isHalted || state.isDrained) return;
    if (queue.output.success.length === 0) return;
    // TODO should allow different strategies, but for now we will say that if any consumer
    // is backpressured, no other consumers will be pushed to, as this could allow a queue
    // to grow indefinitely.
    if (consumers.some((consumer) => consumer.state.backpressure)) return;

    const success = queue.output.success.shift();
    consumers.forEach((consumer) => {
      consumer.push(success!.output);
    });

    requestProcessOutput();
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

  function handleOnDrained() {
    if (!state.isDrained || state.hasHandledOnDrained) return;
    state.hasHandledOnDrained = true;
    eventHandlers.onDrained.forEach((eventHandler) => {
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

    nextStreamie.onBackpressureRelease(() => requestProcessOutput());
    nextStreamie.registerInput(self);

    consumers.push(nextStreamie);

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
    state.shouldDrain = true;
    requestProcessInput();
  }

  // This registers an input streamie, so that this streamie can be triggered to drain
  // in the event that all of its input streamies are drained.
  function registerInput(inputStreamie: Streamie<any, any, any>) {
    inputStreamies.push(inputStreamie);
    inputStreamie.onDrained(() => {
      if (inputStreamies.every((inputStreamie) => inputStreamie.state.isDrained)) {
        drain();
      }
    });
  }

  function onBackpressureRelease(eventHandler: () => void) {
    eventHandlers.onBackpressureRelease.add(eventHandler);
  }

  function onDrained(eventHandler: () => void) {
    if (state.isDrained) return eventHandler();
    eventHandlers.onDrained.add(eventHandler);
  }

  function onError(eventHandler: (payload: { input: BatchedIfConfigured<IQT, C>, error: any }) => void) {
    eventHandlers.onError.add(eventHandler);
  }

  const self = {
    push,
    map,
    filter,

    pause,
    drain,

    registerInput,

    state: {
      get backpressure() {
        return state.backpressure;
      },
      get count() {
        return {
          ...state.count,
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
    onError,

    promise: new Promise((resolve, reject) => {
      onDrained(() => resolve(null));

      if (settings.haltOnError) onError(({ error }) => reject(error));
    }),
  } satisfies Streamie<IQT, OQT, C>;

  return self;
}

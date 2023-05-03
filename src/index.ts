import { Streamie, Handler, Config, BatchedIfConfigured, UnflattenedIfConfigured } from './types';

export default function streamie<
  HI extends any,
  HO extends any,
  const C extends Config,
>(
  handler: Handler<HI, HO, C>,
  config: C,
) {
  const queue: {
    input: HI[];
    output: {
      // A queue pairing the input items with their handler output.
      success: { input: BatchedIfConfigured<HI, C>, output: HO }[];
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
      handling: 0,
    },
    lastHandledAt: null,
    get backpressure() {
      return queue.input.length >= settings.backpressureAt;
    },
    get isDrained() {
      return state.shouldDrain && (queue.input.length === 0) && (state.count.handling === 0) && (queue.output.success.length === 0);
    },
    shouldDrain: false,
    isPaused: false,
    isHalted: false,
    hasHandledOnDrained: false,
  };

  const consumers: Streamie<HO, any, any>[] = []
  const inputStreamies: Streamie<any, any, any>[] = [];

  const eventHandlers: {
    onBackpressureRelease: Set<() => void>;
    onDrained: Set<() => void>;
    onError: Set<(payload: { input: BatchedIfConfigured<HI, C>, error: any }) => void>;
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
    const handlerInput = (settings.batchSize === 1 ? itemsToHandle[0] : itemsToHandle) as BatchedIfConfigured<HI, C>;

    // Since we're in a valid state to process items and we're not yet at concurrency limit,
    // we begin another attempt to process items.
    requestProcessInput();

    if (startedWithBackpressure && !state.backpressure) {
      eventHandlers.onBackpressureRelease.forEach((eventHandler) => {
        eventHandler();
      });
    }

    try {
      // const handlerOutput = await (settings.batchSize === 1
      //   ? (handler as (input: HI) => HO)(handlerInput as HI)
      //   : (handler as (input: HI[]) => HO)(handlerInput as HI[])
      // );
      const handlerOutput: UnflattenedIfConfigured<HO, C> = await handler(handlerInput);


      // If the handler is a filter, we will only push to the output queue if the output is truthy.
      // Otherwise, all outputs go to the output queue.
      if (handlerOutput || !settings.isFilter) {
        if (settings.flatten) {
          if (!Array.isArray(handlerOutput)) throw new Error('Cannot flatten output that is not an array.');
          queue.output.success.push(...(handlerOutput as HO[]).map((output: HO) => ({ input: handlerInput, output })));
        }
        else queue.output.success.push({ input: handlerInput, output: handlerOutput as HO });
      }
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
  function push(...items: HI[]) {
    if (state.isHalted) throw new Error('Cannot push to a halted streamie.');
    if (state.shouldDrain) throw new Error(`Cannot push to a ${ state.isDrained ? 'drained' : 'draining'} streamie.`);

    queue.input.push(...items);
    requestProcessInput();
  }


  function map<NHO extends any, NC extends Config>(
    handler: Handler<HO, NHO, NC>,
    config: NC,
  ): Streamie<HO, NHO, NC> {
    const nextStreamie: Streamie<HO, NHO, NC> = streamie<HO, NHO, NC>(handler, config);

    nextStreamie.onBackpressureRelease(() => requestProcessOutput());
    nextStreamie.registerInput(self);

    consumers.push(nextStreamie);

    return nextStreamie;
  }

  function filter<NHO extends any, NC extends Config>(
    handler: Handler<HO, NHO, NC>,
    config: NC,
  ): Streamie<HO, NHO, NC> {
    return map<NHO, NC>(handler, { ...config, isFilter: true });
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

  function onError(eventHandler: (payload: { input: BatchedIfConfigured<HI, C>, error: any }) => void) {
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
  } satisfies Streamie<HI, HO, C>;

  return self;
}

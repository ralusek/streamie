import { Streamie, Handler, Config, Consumer, Flatten, FlattenIfConfigTrue } from './types';

type SuccessQueue<HI extends any, HO extends any, C extends Config> =
'batchSize' extends keyof C 
? C['batchSize'] extends (1 | undefined) 
    ? { input: HI, output: Awaited<FlattenIfConfigTrue<HO, C>> }
    : { input: HI[], output: Awaited<FlattenIfConfigTrue<HO, C>> }
: { input: HI, output: Awaited<FlattenIfConfigTrue<HO, C>> };

export default function streamie<
  HI extends any,
  HO extends any,
  // Adding const here allows things like batchSize to be inferred as 1 instead of number,
  // or flatten as true instead of boolean, which are necessary for the conditional types
  const C extends Config,
>(
  handler: Handler<HI, HO, C>,
  config: C,
) {
  const queue: {
    input: HI[];
    output: {
      // A queue pairing the input items with their handler output.
      success: SuccessQueue<HI, HO, C>[];
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

  const consumers: Consumer<HI, HO, C>[] = [];
  const inputStreamies: Streamie<any, HI, any>[] = [];

  const eventHandlers: {
    onBackpressureRelease: Set<() => void>;
    onDrained: Set<() => void>;
    onError: Set<(payload: { input: HI[], error: any }) => void>;
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
    const handlerInput = settings.batchSize === 1 ? itemsToHandle[0] as HI : itemsToHandle as HI[];

    // Since we're in a valid state to process items and we're not yet at concurrency limit,
    // we begin another attempt to process items.
    requestProcessInput();

    if (startedWithBackpressure && !state.backpressure) {
      eventHandlers.onBackpressureRelease.forEach((eventHandler) => {
        eventHandler();
      });
    }

    try {
      const handlerOutput = await (settings.batchSize === 1
        ? (handler as (input: HI) => HO)(handlerInput as HI)
        : (handler as (input: HI[]) => HO)(handlerInput as HI[])
      );

      // If the handler is a filter, we will only push to the output queue if the output is truthy.
      // Otherwise, all outputs go to the output queue.
      if (handlerOutput || !settings.isFilter) {
        if (settings.flatten) {
          if (!Array.isArray(handlerOutput)) throw new Error('Cannot flatten output that is not an array.');
          const items = handlerOutput.map((output) => ({ input: handlerInput, output }));
          // @ts-ignore
          queue.output.success.push(...items);
        }
        // @ts-ignore
        else queue.output.success.push({ input: itemsToHandle, output: handlerOutput });
      }
    } catch (err) {
      if (settings.haltOnError) state.isHalted = true;
      eventHandlers.onError.forEach((eventHandler) => {
        eventHandler({ input: itemsToHandle, error: err });
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
    if (consumers.some((consumer) => consumer.streamie.state.backpressure)) return;

    const success = queue.output.success.shift();
    if (success) {
      consumers.forEach((consumer) => {
        // @ts-ignore
        consumer.push(success);
      });
    }

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


  function map<
    NHI extends FlattenIfConfigTrue<HO, C>,
    NHO extends any,
    const NC extends Config
  >(
    handler: Handler<NHI, NHO, NC>,
    config: NC,
  ) {
    // const nextStreamie: Streamie<C['flatten'] extends true ? Flatten<HO> : HO, NHO, NC> = streamie<C['flatten'] extends true ? Flatten<HO> : HO, NHO, NC>(handler, config);
    // const nextStreamie: Streamie<NHI, NC['flatten'] extends true ? Flatten<NHO> : NHO, NC> = streamie<NHI, NC['flatten'] extends true ? Flatten<NHO> : NHO, NC>(handler, config);
    const nextStreamie: Streamie<NHI, NHO, NC> = streamie<NHI, NHO, NC>(handler, config);

    nextStreamie.onBackpressureRelease(() => requestProcessOutput());
    nextStreamie.registerInput(self);

    const consumerPush = ((item: Parameters<Consumer<HI, HO, C>['push']>[0]) => {
      nextStreamie.push(item.output as NHI);
    }) as Consumer<HI, HO, C>['push'];

    const consumer = {
      push: consumerPush,
      streamie: nextStreamie,
    } as Consumer<HI, HO, C>;

    consumers.push(consumer);

    return nextStreamie;
  }
  

  function filter<
      NHI extends C['flatten'] extends true ? Flatten<HO> : HO,
      NHO extends any,
      const NC extends Config
  >(
    handler: Handler<NHI, NHO, NC>,
    config: NC,
  ) {
    return map<NHI, NHO, NC>(handler, { ...config, isFilter: true });
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

  function onError(eventHandler: (payload: { input: HI[], error: any }) => void) {
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

export type BatchedIfConfigured<T, C extends Config> =
    'batchSize' extends keyof C
    ? (C['batchSize'] extends (1 | undefined)
        ? T
        : T[])
    : T;

export type UnflattenedIfConfigured<T, C extends Config> =
    'flatten' extends keyof C
    ? (C['flatten'] extends true
        ? T[]
        : T)
    : T;

export type Handler<HI, HO, C extends Config> = (input: BatchedIfConfigured<HI, C>) => UnflattenedIfConfigured<HO, C>;

function test<HI, HO, const C extends Config>(
  handler: Handler<HI, HO, C>,
  config: C,
): Streamie<HI, HO, C> {
  return {
    push: (item: HI) => {
      // handler(config.batchSize && config.batchSize !== 1 ? [item] : item);
    },
    map: <NHO extends any, NC extends Config>(
      handler: Handler<HO, NHO, NC>,
      config: NC,
    ) => test(handler, config),
    filter: <NHO extends any, NC extends Omit<Config, 'isFilter'>>(
      handler: Handler<HO, NHO, NC>,
      config: NC,
    ) => test(handler, config),
    pause: (shouldPause?: boolean) => {},
    drain: () => {},
    registerInput: (inputStreamie: Streamie<any, any, any>) => {},
    onBackpressureRelease: (eventHandler: () => void) => {},
    onDrained: (eventHandler: () => void) => {},
    onError: (eventHandler: (payload: { input: BatchedIfConfigured<HI, C>; error: any; }) => void) => {},
    promise: new Promise(() => {}),

    state: {
      backpressure: false,
      isPaused: false,
      isDrained: false,
      isHalted: false,
      count: {
        handling: 0,
      },
    },
  };
}

const x = test<number, number[][], { batchSize: 2, flatten: false }>((input: number[]): number[][] => {
  return [input];
}, { batchSize: 2, flatten: false})
// .map((input) => {
  
// }, { batchSize: 2});

x.push(5);



export type Config = {
  // The number of items that can be in the input queue before backpressure will output as true.
  // New items can still always be added to the queue, but respectful consumers will wait for
  // backpressure to be false before adding more.
  backpressureAt?: number;
  // The number of items which can be processed concurrently.
  concurrency?: number;
  // The number of items that should wait to be processed in a single handler call. Fewer items will
  // be passed into the handler in the event that the streamie has been told to clear, or in the event
  // that the maxBatchWait time has elapsed.
  batchSize?: number;
  // The maximum amount of time that should be waited before processing a batch of items. Should the
  // amount of time since the last handler call exceed this value, the handler will be called with
  // fewer than batchSize items.
  maxBatchWait?: number;
  // Means that truthiness of output determines whether or not it goes to the output queue.
  isFilter?: boolean;
  // Whether streamie should stop and throw an error on the promise upon encountering an error in a handler.
  haltOnError?: boolean;
  // Should flatten the output.
  flatten?: boolean;
};

export type Streamie<HI extends any, HO extends any, C extends Config> = {
  push: (item: HI) => void;

  // Forks for new streamies
  map: <NHO extends any, NC extends Config>(
    handler: Handler<HO, NHO, NC>,
    config: NC,
  ) => Streamie<HO, NHO, NC>;
  filter: <NHO extends any, NC extends Omit<Config, 'isFilter'>>(
    handler: Handler<HO, NHO, NC>,
    config: NC,
  ) => Streamie<HO, NHO, NC>;

  // Control flow
  pause: (shouldPause?: boolean) => void;
  drain: () => void;

  // Register input streamies
  // We woudl be included to say that the "HO" of an input streamie should be
  // the "HI" of this streamie, but we would need to know whether or not the
  // input streamie had been flattened.
  registerInput: (inputStreamie: Streamie<any, any, any>) => void;

  // Event handler registration
  onBackpressureRelease: (eventHandler: () => void) => void;
  onDrained: (eventHandler: () => void) => void;
  onError: (eventHandler: (payload: { input: BatchedIfConfigured<HI, C>, error: any }) => void) => void;

  // Public state
  state: {
    backpressure: boolean;
    isPaused: boolean;
    isDrained: boolean;
    isHalted: boolean;
    count: {
      handling: number;
    };
  };

  // Promise which resolves when the streamie is drained.
  promise: Promise<null>;
};

export type Handler<HI, HO> = (input: HI[]) => HO;

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

export type Streamie<HI extends any, HO extends any> = {
  push: (item: HI) => void;

  // Forks for new streamies
  map: <NHO extends any, C extends Config>(
    handler: Handler<HO, NHO>,
    config: C,
  ) => Streamie<HO, NHO>;
  filter: <NHO extends any, C extends Omit<Config, 'isFilter'>>(
    handler: Handler<HO, NHO>,
    config: C,
  ) => Streamie<HO, NHO>;

  // Control flow
  pause: (shouldPause?: boolean) => void;
  drain: () => void;

  // Register input streamies
  registerInput: (inputStreamie: Streamie<any, HI>) => void;

  // Event handler registration
  onBackpressureRelease: (eventHandler: () => void) => void;
  onDrained: (eventHandler: () => void) => void;
  onError: (eventHandler: (payload: { input: HI[];  error: any; }) => void) => void;

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

export type Consumer<HI extends any, HO extends any, NHO extends any> = {
  push: (item: { input: HI[], output: HO }) => void;
  streamie: Streamie<HO, NHO>;
};

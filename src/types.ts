export type Handler<HI, HO, C extends Config> = 
    'batchSize' extends keyof C 
    ? (C['batchSize'] extends (1 | undefined) 
        ? (input: HI) => HO 
        : (input: HI[]) => HO) 
    : (input: HI) => HO;

export type FlattenIfConfigTrue<T extends any, C extends Config> = C['flatten'] extends true ? Flatten<T> : T;

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
  batchSize?: 1 | undefined | number;
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

export type Flatten<T> = T extends any[] ? T[number] : T;

export type Streamie<HI extends any, HO extends any, C extends Config> = {
  push: (...items: HI[]) => void;

  // Forks for new streamies
  map: <NHI extends FlattenIfConfigTrue<HO, C>, NHO extends any, NC extends Config>(
    handler: Handler<NHI, NHO, NC>,
    config: NC,
  ) => Streamie<NHI, NHO, NC>;

  filter: <NHI extends FlattenIfConfigTrue<HO, C>, NHO extends any, NC extends Omit<Config, 'isFilter'>>(
    handler: Handler<NHI, NHO, NC>,
    config: NC,
  ) => Streamie<NHI, NHO, NC>;

  // Control flow
  pause: (shouldPause?: boolean) => void;
  drain: () => void;

  // Register input streamies
  registerInput: (inputStreamie: Streamie<any, any, any>) => void;

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

export type Consumer<HI extends any, HO extends any, C extends Config> =
'batchSize' extends keyof C 
? C['batchSize'] extends (1 | undefined) 
    ? {
        push: (item: { input: HI; output: FlattenIfConfigTrue<HO, C> }) => void;
        streamie: Streamie<FlattenIfConfigTrue<HO, C>, any, any>;
      } 
    : {
        push: (item: { input: HI[]; output: FlattenIfConfigTrue<HO, C> }) => void;
        streamie: Streamie<FlattenIfConfigTrue<HO, C>, any, any>;
      }
: {
    push: (item: { input: HI; output: FlattenIfConfigTrue<HO, C> }) => void;
    streamie: Streamie<FlattenIfConfigTrue<HO, C>, any, any>;
  };



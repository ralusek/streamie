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

export type OutputIsInputIfFilter<IQT, OQT, C extends Config> =
    'isFilter' extends keyof C
    ? (C['isFilter'] extends true
        ? IQT
        : OQT)
    : OQT;

export type BooleanIfFilter<OQT, C extends Config> =
    'isFilter' extends keyof C
    ? (C['isFilter'] extends true
        ? boolean
        : OQT)
    : OQT;

export type IfFilteredElse<A, B, C extends Config> =
    'isFilter' extends keyof C
    ? (C['isFilter'] extends true
        ? A
        : B)
    : B;

export type Handler<IQT, OQT, C extends Config> = (input: BatchedIfConfigured<IQT, C>, tools: Tools<IQT, OQT, C>) => BooleanIfFilter<UnflattenedIfConfigured<OQT, C>, C> | Promise<BooleanIfFilter<UnflattenedIfConfigured<OQT, C>, C>>;


type Tools<IQT, OQT, C extends Config> = {
  self: Streamie<IQT, OQT, C>;
  push: Streamie<IQT, OQT, C>['push'];
  index: number;
};


export type Config = {
  // The number of items that can be in the output queue before backpressure will output as true.
  // New items can still always be added to the input queue, but respectful consumers will wait for
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
  // Means that truthiness of output determines whether or not the respective input goes into the output queue.
  isFilter?: boolean;
  // Whether streamie should stop and throw an error on the promise upon encountering an error in a handler.
  haltOnError?: boolean;
  // Should flatten the output.
  flatten?: boolean;
};

export type Streamie<IQT extends any, OQT extends any, C extends Config> = {
  push: (item: IQT) => void;

  // Forks for new streamies
  map: <
    NOQT extends IfFilteredElse<
      BatchedIfConfigured<OQT, NC>,
      any,
      NC
    >,
    NC extends Config,
  >(
    handler: Handler<
      OQT,
      NOQT,
      NC
    >,
    config: NC,
  ) => Streamie<OQT, NOQT, NC>;
  filter: <NC extends Omit<Config, 'isFilter'>>(
    handler: Handler<OQT, boolean, NC>,
    config: NC,
  ) => Streamie<OQT, BatchedIfConfigured<OQT, NC>, NC>;

  // Control flow
  pause: (shouldPause?: boolean) => void;
  drain: () => void;

  // Register input streamies
  // We woudl be included to say that the "OQT" of an input streamie should be
  // the "IQT" of this streamie, but we would need to know whether or not the
  // input streamie had been flattened.
  registerInput: (inputStreamie: Streamie<any, IQT, any>) => void;
  registerOutput: (outputStreamie: Streamie<OQT, any, any>) => void;

  // Event handler registration
  onBackpressureRelease: (eventHandler: () => void) => void;
  onDrained: (eventHandler: () => void) => void;
  onDraining: (eventHandler: () => void) => void;
  onError: (eventHandler: (payload: { input: BatchedIfConfigured<IQT, C>, error: any }) => void) => void;

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

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

// This is a type representing the streamie output. Normally, the output of the streamie
// is the OQT of its handler. The OQT of its handler is, in the case of a streamie with
// flattened: false, going to just be the return value of the handler function. In the case
// of a streamie with flattened: true, the OQT of its handler is going to be the type of
// the item extracted from the array. Said another way, if flattened: true, the return
// value of the handler is OQT[]. In either case, what is getting put into the output queue
// is the OQT of the handler.
// However, if the streamie is a filter, then the output of the current streamie is just the
// input type of its handler, as is the case with an array's native filter function. In the
// case of an unbatched streamie, the input type of the handler is the IQT. In the case of a
// batched streamie, the input type of the handler is IQT[]
export type StreamieOutput<IQT, OQT, C extends Config> = OutputIsInputIfFilter<BatchedIfConfigured<IQT, C>, OQT, C>;

export type Handler<IQT, OQT, C extends Config> = (input: BatchedIfConfigured<IQT, C>) => BooleanIfFilter<UnflattenedIfConfigured<OQT, C>, C> | Promise<BooleanIfFilter<UnflattenedIfConfigured<OQT, C>, C>>;

function doThing<C extends Config>(config: C) {
  const a: OutputIsInputIfFilter<BatchedIfConfigured<number, { batchSize: 1 }>, 5, { isFilter: false }> = 5;
}



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
  registerInput: (inputStreamie: Streamie<any, any, any>) => void;

  // Event handler registration
  onBackpressureRelease: (eventHandler: () => void) => void;
  onDrained: (eventHandler: () => void) => void;
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

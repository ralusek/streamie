import { StreamieQueueError } from './error';

export type MaybePromise<T> = T | Promise<T>;

export type Config = {
  backpressureAt?: number | {
    input?: number;
    output?: number;
  };
  concurrency?: number;
  batchSize?: number;
  maxBatchWait?: number;
  haltOnError?: boolean;
  flatten?: boolean;
  propagateErrors?: boolean;
};

export type InternalConfig = Config & {
  /** @internal .filter() owns public filter typing. */
  isFilter?: boolean;
};

export type BatchSize<C> =
  C extends { batchSize: infer BS }
    ? BS
    : undefined;

export type IsBatched<C> =
  BatchSize<C> extends 1 | undefined
    ? false
    : true;

export type HandlerInput<I, C extends Config> =
  IsBatched<C> extends true
    ? I[]
    : I;

export type BatchedIfConfigured<T, C extends Config> = HandlerInput<T, C>;

export type ElementOf<T> =
  Awaited<T> extends readonly (infer E)[]
    ? E
    : never;

export type NormalStreamOutput<R, C extends Config> =
  C extends { flatten: true }
    ? ElementOf<Awaited<R>>
    : Awaited<R>;

export type FilterStreamOutput<I, C extends Config> =
  C extends { flatten: true }
    ? ElementOf<HandlerInput<I, C>>
    : HandlerInput<I, C>;

export type FlattenableFilterConfig<I, C extends Config> =
  C extends { flatten: true }
    ? HandlerInput<I, C> extends readonly unknown[]
      ? unknown
      : never
    : unknown;

export type Tools<I> = {
  push: (item: I) => void;
  drain: () => void;
  index: number;
};

export type Handler<I, R, C extends Config> = (
  input: HandlerInput<I, C>,
  tools: Tools<I>,
) => MaybePromise<R>;

export type FilterHandler<I, C extends Config> = (
  input: HandlerInput<I, C>,
  tools: Tools<I>,
) => MaybePromise<boolean>;

export type NormalHandlerReturnConstraint<C extends Config> =
  C extends { flatten: true }
    ? readonly unknown[]
    : unknown;

// Backwards-compatible utility aliases. The new public API should prefer
// HandlerInput, NormalStreamOutput, and FilterStreamOutput because those names
// separate the three shapes that the old aliases mixed together.
export type UnflattenedIfConfigured<T, C extends Config> =
  C extends { flatten: infer F }
    ? (F extends true
        ? T[]
        : T)
    : T;

export type OutputIsInputIfFilter<IQT, OQT, C extends InternalConfig> =
  C extends { isFilter: infer F }
    ? (F extends true
        ? IQT
        : OQT)
    : OQT;

export type BooleanIfFilter<OQT, C extends InternalConfig> =
  C extends { isFilter: infer F }
    ? (F extends true
        ? boolean
        : OQT)
    : OQT;

export type IfFilteredElse<A, B, C extends InternalConfig> =
  C extends { isFilter: infer F }
    ? (F extends true
        ? A
        : B)
    : B;

export type Streamie<I, O, C extends Config> = {
  push: (...items: I[]) => void;

  map: <
    const NC extends Config,
    R extends NormalHandlerReturnConstraint<NC>,
  >(
    handler: Handler<O, R, NC>,
    config: NC,
  ) => Streamie<O, NormalStreamOutput<R, NC>, NC>;

  filter: <
    const NC extends Config,
  >(
    handler: FilterHandler<O, NC>,
    config: NC & FlattenableFilterConfig<O, NC>,
  ) => Streamie<O, FilterStreamOutput<O, NC>, NC>;

  pause: (shouldPause?: boolean) => void;
  drain: () => void;

  registerInput: (inputStreamie: Streamie<any, I, any>) => void;
  registerOutput: (outputStreamie: Streamie<O, any, any>) => void;

  onBackpressureRelease: (eventHandler: () => void) => void;
  onDrained: (eventHandler: () => void) => void;
  onDraining: (eventHandler: () => void) => void;
  onError: (eventHandler: (error: StreamieQueueError<I, C>) => void) => void;
  onHalted: (eventHandler: () => void) => void;

  _pushQueueError: (error: StreamieQueueError<any, any>) => void;

  state: {
    backpressure: {
      input: boolean;
      output: boolean;
    };
    isPaused: boolean;
    isDrained: boolean;
    isHalted: boolean;
    count: {
      handling: number;
      started: number;
      queued: {
        input: number;
        output: number;
      };
    };
  };

  promise: Promise<null>;
};

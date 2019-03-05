import Streamie from './index';
import StreamieState from './StreamieState';
import Emittie from '@root/Emittie';

/**
 * The private namespace for instances of Streamie.
 */
export type StreamiePrivateNamespace = {
  emittie: Emittie,
  handler: Handler,
  state: StreamieState,
  config: StreamieConfig
};

/**
 * The configuration object to be passed to the Streamie constructor.
 */
export type StreamieConfig = {
  concurrency?: number,
  flatten?: boolean,
  batchSize?: number,
  /**
   * Whether or not streamie should continue handling until _all_ children have
   * saturated backlogs, as opposed to _any_ children.
   */
  shouldSaturateChildren?: boolean,
  /** The multiplier from concurrency used to determine the maxBacklogLength if none provided. */
  maxBacklogFromConcurrency?: number,
  /**
   * The maximum the queue length is allowed to get before upstream parents will
   * stop
   * */
  maxBacklogLength?: number
};

/**
 * Various useful state and utilities passed in on handler's invocation.
 */
export type HandlerUtilities = {
  streamie: Streamie
};

/**
 * The data item to be pushed into the stream for processing.
 */
export type Item = any;

/**
 * The streamie's Handler function, to be called for every item processed in the
 * stream.
 */
export type Handler = (item:Item, utils:HandlerUtilities) => HandlerResult;

/**
 * The resulting output from the Streamie's Handler function.
 */
export type HandlerResult = any;

import Streamie from './index';
import StreamieState from './StreamieState';

/**
 * The private namespace for instances of Streamie.
 */
export type StreamiePrivateNamespace = {
  handler: Handler,
  state: StreamieState,
  config: StreamieConfig
};

/**
 * The configuration object to be passed to the Streamie constructor.
 */
export type StreamieConfig = {
  concurrency?: number
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

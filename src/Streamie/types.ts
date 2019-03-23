import { StreamieQueue } from './StreamieQueue/types';
import { Emittie } from '@root/utils/Emittie/types';
import { EventName } from './private/events/types';

/**
 *
 */
export type StreamieState<InputItem = any, OutputItem = any> = {
  private: StreamiePrivateState<InputItem, OutputItem>,
  public: Streamie<InputItem, OutputItem>,
};

/**
 * Streamie public state.
 */
export type Streamie<InputItem = any, OutputItem = any> = {

};

/**
 * The private namespace for instances of Streamie
 */
export type StreamiePrivateState<InputItem = any, OutputItem = any> = {
  emittie: Emittie<EventName>,
  handler: StreamieHandler<InputItem, OutputItem>,
  // state: StreamieState,
  config: StreamieConfig,
  queue: StreamieQueue<InputItem, OutputItem>,
};


/**
 * The configuration object to be passed to the Streamie constructor.
 */
export type StreamieConfig = {
  concurrency: number,
  flatten: boolean,
  batchSize: number,
  /**
   * Whether or not streamie should continue handling until _all_ children have
   * saturated backlogs, as opposed to _any_ children.
   */
  shouldSaturateChildren: boolean,
  /** */
  maxBacklogLength: number
};

/**
 * Various useful state and utilities passed in on handler's invocation.
 */
export type HandlerUtilities<InputItem, OutputItem> = {
  streamie: Streamie<InputItem, OutputItem>
};


/**
 * The streamie's Handler function, to be called for every item processed in the
 * stream.
 */
export type StreamieHandler<InputItem, OutputItem> = (
  item: InputItem,
  utils: HandlerUtilities<InputItem, OutputItem>
) => StreamieHandlerResult<OutputItem>;

/**
 * The resulting output from the Streamie's Handler function.
 */
export type StreamieHandlerResult<OutputItem> = OutputItem

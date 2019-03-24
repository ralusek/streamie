import { StreamiePrivateState } from './private/types';
import { Streamie } from './public/types';

/**
 *
 */
export type StreamieState<InputItem, OutputItem> = {
  private: StreamiePrivateState<InputItem, OutputItem>,
  public: Streamie<InputItem, OutputItem>,
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
  maxBacklogLength: number,
  /** Should automatically advance the queue items without .advance having been explicitly called. */
  autoAdvance: boolean,
};


/**
 * The streamie's Handler function, to be called for every item processed in the
 * stream.
 */
export type StreamieHandler<InputItem, OutputItem> = (
  input: InputItem | InputItem[],
  utils: HandlerUtilities<InputItem, OutputItem>
) => StreamieHandlerResult<OutputItem> | PromiseLike<StreamieHandlerResult<OutputItem>>;

/**
 * Various useful state and utilities passed in on handler's invocation.
 */
export type HandlerUtilities<InputItem, OutputItem> = {
  streamie: Streamie<InputItem, OutputItem>
};

/**
 * The resulting output from the Streamie's Handler function.
 */
export type StreamieHandlerResult<OutputItem> = OutputItem | OutputItem[]

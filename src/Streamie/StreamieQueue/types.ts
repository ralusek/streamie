// Types
import { DeferredWithPromise } from '@root/utils/defer';
import { LinkedList } from '@root/utils/LinkedList/types';

/**
 *
 */
export type StreamieQueueState<InputItem = any, OutputItem = any> = {
  private: StreamieQueuePrivateState<InputItem, OutputItem>,
  public: StreamieQueue<InputItem, OutputItem>,
};

/**
 *
 */
export type StreamieQueue<InputItem = any, OutputItem = any> = {
  /**
   * Permit the advancement (shifting) of a queue item.
   */
  advance: () => PromiseLike<OutputItem>
  /**
   * Push an item into the tail of the queue O(1)
   * @param item - The item to push into the queue.
   * @returns - The StreamieQueueItem for the Item that was added to the queue.
   */
  push: (item: InputItem) => StreamieQueueItem<InputItem, OutputItem>,
  /**
   * Attempts to shift items from the queue O(M), where M is number of items to remove.
   * @param batchSize The amount of items to shift (M)
   * @returns StreamieQueueItem if the shift was possible/allowed.
   */
  shift: (batchSize: number) => StreamieQueueOutput<InputItem, OutputItem>[],

  amountAdvanced: number,
  amountQueued: number,
};

/**
 * The private namespace for instances of StreamieQueue
 */
export type StreamieQueuePrivateState<InputItem = any, OutputItem = any> = {
  /** */
  advancedPlaceholders: LinkedList<StreamieQueueAdvancedPlaceholder<OutputItem>>,
  /** */
  queued: LinkedList<StreamieQueueItem<InputItem, OutputItem>>,
};

/**
 * A StreamieQueue item container.
 */
export type StreamieQueueItem<InputItem, OutputItem> = {
  createdAt: number,
  item: InputItem,
  deferredHandler: DeferredWithPromise<OutputItem>,
};

/**
 * A StreamieQueue advanced placeholder container.
 */
export type StreamieQueueAdvancedPlaceholder<OutputItem> = {
  createdAt: number,
  deferredHandler: DeferredWithPromise<OutputItem>
};

/**
 * A combinatio of a StreamieQueueItem adn a StreamieQueueAdvancedPlaceholder.
 */
export type StreamieQueueOutput<InputItem, OutputItem> = {
  advancedPlaceholder: StreamieQueueAdvancedPlaceholder<OutputItem>,
  queueItem: StreamieQueueItem<InputItem, OutputItem>,
};

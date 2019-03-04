// Types
import { Item } from "../types";
import { DeferredWithPromise } from "@root/utils/defer";

/**
 * The private namespace for instances of StreamieQueue
 */
export type StreamieQueuePrivateNamespace = {
  /**
   * The first item in the queue. Will be replaced by the next item in the event
   * of a .shift()
   */
  head?: StreamieQueueItemContainer,
  /**
   * The last item in the queue. Will be replaced by a new item in the event of
   * a .push()
   */
  tail?: StreamieQueueItemContainer,
  /**
   * The length of the queue.
   */
  length: number,
  /**
   * Whether or not the item should automatically advance.
   */
  canAutoAdvance: boolean,
  /**
   * The amount of queue items permitted to be shifted out of the queue.
   */
  itemsPermittedToAdvance: number
};

/**
 * The constructor configuration for StreamieQueueConfig.
 */
export type StreamieQueueConfig = {
  canAutoAdvance?: boolean
};

/**
 * A StreamieQueue item container.
 */
export type StreamieQueueItem = {
  createdAt: number,
  item: Item,
  deferredHandler: DeferredWithPromise
};

/**
 * A container for a StreamieQueueItem for facilitating linked list implementation
 */
export type StreamieQueueItemContainer = {
  queueItem: StreamieQueueItem,
  next?: StreamieQueueItemContainer
};

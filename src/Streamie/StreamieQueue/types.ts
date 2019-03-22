// Types
import { DeferredWithPromise } from "@root/utils/defer";
import { LinkedList } from "@root/utils/LinkedList";

/**
 * The private namespace for instances of StreamieQueue
 */
export type StreamieQueuePrivateNamespace<StreamieInputItem = any> = {
  /** */
  advancedPlaceholders: LinkedList<StreamieQueueAdvancedPlaceholder>,
  /** */
  queued: LinkedList<StreamieInputItem>,
  handling: Set<StreamieInputItem>,
  /** The length of the queue. */
  length: number,
  /** Whether or not the item should automatically advance. */
  canAutoAdvance: boolean,
  /** The batch size of a shift. */
  batchSize: number,
};

/**
 * The constructor configuration for StreamieQueueConfig.
 */
export type StreamieQueueConfig = {
  canAutoAdvance?: boolean,
  batchSize?: number,
};

/**
 * A StreamieQueue item container.
 */
export type StreamieQueueItem<StreamieInputItem> = {
  createdAt: number,
  item: StreamieInputItem,
  deferredHandler: DeferredWithPromise
};

/**
 * A StreamieQueue advanced placeholder container.
 */
export type StreamieQueueAdvancedPlaceholder = {
  createdAt: number,
  deferredHandler: DeferredWithPromise
};

// Types
import { Item } from "@root/Streamie/types";
import { DeferredWithPromise } from "@root/utils/defer";

/**
 * The private namespace for instances of QueueItem.
 */
export type QueueItemPrivateNamespace = {
  item: Item,
  createdAt: number,
  deferred: DeferredWithPromise,
};

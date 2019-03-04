// Types
import { Item } from "@root/Streamie/types";
import { StreamieQueueItem } from "@root/Streamie/StreamieQueue/types";

// Utils
import { defer } from "@root/utils/defer";


/**
 * Generates a queue item.
 * @returns StreamieQueueItem for the item.
 */
export default (item: Item): StreamieQueueItem => {
  return {
    createdAt: Date.now(),
    item,
    deferredHandler: defer()
  };
};

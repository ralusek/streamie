// Types
import { Item } from "@root/Streamie/types";
import { StreamieQueueItemContainer } from "@root/Streamie/StreamieQueue/types";

// Utils
import { defer } from "@root/utils/defer";
import _createQueueItem from "../_createQueueItem";


/**
 * Generates a queue item.
 * @returns StreamieQueueItem for the item.
 */
export default (item: Item): StreamieQueueItemContainer => {
  return { queueItem: _createQueueItem(item) };
};

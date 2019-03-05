// Types
import { StreamieQueueItem, StreamieQueuePrivateNamespace, StreamieQueueItemContainer } from "@root/Streamie/StreamieQueue/types";
import { Item } from "@root/Streamie/types";
import { P } from "@root/utils/namespace";
import { StreamieQueue } from "@root/Streamie/StreamieQueue";

// Private methods
import _createQueueItemContainer from "../../private/_createQueueItemContainer";

/**
 * Push an item into the tail of the queue O(1)
 * @param p - The private namespace getter
 * @param self - The StreamieQueue instance
 * @param item - The item to push into the queue.
 * @returns - The StreamieQueueItem for the Item that was added to the queue.
 */
export default (
  p: P<StreamieQueue, StreamieQueuePrivateNamespace>,
  self: StreamieQueue,
  item: Item
): StreamieQueueItem => {
  p(self).length++;

  const existing: StreamieQueueItemContainer = p(self).tail;
  const newItem: StreamieQueueItemContainer = _createQueueItemContainer(item);

  p(self).tail = newItem;

  if (existing) existing.next = newItem;
  // Queue was empty, so self item is also the head
  else p(self).head = newItem;

  console.log('Head:', p(self).head && p(self).head.queueItem.item);
  console.log('Tail', p(self).tail && p(self).tail.queueItem.item);
  console.log('Length:', p(self).length);

  return newItem.queueItem;
};

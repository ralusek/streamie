// Types
import {
  StreamieQueueItem,
  StreamieQueueItemContainer,
  StreamieQueuePrivateNamespace
} from "@root/Streamie/StreamieQueue/types";
import { P } from "@root/utils/namespace";
import { StreamieQueue } from "@root/Streamie/StreamieQueue";

/**
   * Attempts to shift an item off the head of the queue O(1)
   * TODO in order to work with batches, requests to shift should do nothing
   * while the queue.length < batchSize, at which point it should shift all of
   * them. The only time shift with queue.length < batchSize should not be
   * ignored is if queue is configured to be in drain mode, in which case it
   * should also prevent the .pushing of new items.
   * @param p - The private namespace getter
   * @param self - The StreamieQueue instance
   * @returns StreamieQueueItem if the shift was possible/allowed.
   */
export default (
  p: P<StreamieQueue, StreamieQueuePrivateNamespace>,
  self: StreamieQueue,
): StreamieQueueItem | undefined => {
  const existing: StreamieQueueItemContainer = p(self).head;
  if (!existing) return; // No queue items, empty shift.

  if (p(self).itemsPermittedToAdvance) p(self).itemsPermittedToAdvance--;
  // No items permitted to advance, and auto advance not enabled.
  else if (!p(self).canAutoAdvance) return;

  p(self).length--;

  const next: StreamieQueueItemContainer = existing.next;

  if (next) p(self).head = existing.next;
  // Queue is empty now, so de-reference head and tail.
  else {
    p(self).head = undefined;
    p(self).tail = undefined;
  }

  console.log('Head:', p(self).head && p(self).head.queueItem.item);
  console.log('Tail', p(self).tail && p(self).tail.queueItem.item);
  console.log('Length:', p(self).length);

  return existing.queueItem;
};

// Types
import { P } from '@root/utils/namespace';
import { LinkedListItemContainer, LinkedListPrivateNamespace } from '@root/utils/LinkedList/types';
import { LinkedList } from '@root/utils/LinkedList';
import { LinkedListShiftConfig } from './types';

/**
   * Attempts to shift an item off the head of the queue O(1)
   * TODO in order to work with batches, requests to shift should do nothing
   * while the queue.length < batchSize, at which point it should shift all of
   * them. The only time shift with queue.length < batchSize should not be
   * ignored is if queue is configured to be in drain mode, in which case it
   * should also prevent the .pushing of new items.
   * @param p - The private namespace getter
   * @param self - The LinkedList instance
   * @param config - The shift configuration.
   * @returns LinkedListItem if the shift was possible/allowed.
   */
export default <LinkedListItem>(
  p: P<LinkedList<LinkedListItem>, LinkedListPrivateNamespace<LinkedListItem>>,
  self: LinkedList<LinkedListItem>,
  {
    batchSize = 1,
    batchSizeIsMinimum = true
  }: LinkedListShiftConfig = {}
): LinkedListItem[] | undefined => {
  const available = p(self).length;
  if (available < batchSize && batchSizeIsMinimum) return;

  batchSize = Math.min(available, batchSize);
  if (batchSize < 1) return;

  p(self).length -= batchSize;

  const shifted = [];

  let head: LinkedListItemContainer<LinkedListItem> = p(this).head;
  for (let i = 0; i < batchSize; i++) {
    shifted.push(head.item);
    head = head.next;
  }

  if (head.next) p(self).head = head.next;
  // Queue is empty now, so de-reference head and tail.
  else {
    p(self).head = undefined;
    p(self).tail = undefined;
  }

  console.log('Head:', p(self).head && p(self).head.item);
  console.log('Tail', p(self).tail && p(self).tail.item);
  console.log('Length:', p(self).length);

  return shifted;
};

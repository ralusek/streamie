// Types
import { LinkedList } from '@root/utils/LinkedList';
import { LinkedListPrivateNamespace, LinkedListItemContainer } from '@root/utils/LinkedList/types';
import { Item } from '@root/Streamie/types';
import { P } from '@root/utils/namespace';



/**
 * Push an item into the tail of the queue O(1)
 * @param p - The private namespace getter
 * @param self - The LinkedList instance
 * @param item - The item to push into the queue.
 * @returns - The LinkedListItem for the Item that was added to the queue.
 */
export default <LinkedListItem>(
  p: P<LinkedList<LinkedListItem>, LinkedListPrivateNamespace<LinkedListItem>>,
  self: LinkedList<LinkedListItem>,
  item: Item
): LinkedListItem => {
  p(self).length++;

  const existing: LinkedListItemContainer<LinkedListItem> = p(self).tail;
  const newItem: LinkedListItemContainer<LinkedListItem> = {item};

  p(self).tail = newItem;

  if (existing) existing.next = newItem;
  // Queue was empty, so self item is also the head
  else p(self).head = newItem;

  console.log('Head:', p(self).head && p(self).head.item);
  console.log('Tail', p(self).tail && p(self).tail.item);
  console.log('Length:', p(self).length);

  return newItem.item;
};

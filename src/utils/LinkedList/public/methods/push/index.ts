// Types
import { LinkedListState, LinkedListItemContainer } from '@root/utils/LinkedList/types';


/**
 * Push an item into the tail of the queue O(1)
 * @param state - The LinkedList state.
 * @param item - The item to push into the queue.
 * @returns - The LinkedListItem for the Item that was added to the queue.
 */
export default <LinkedListItem>(
  state: LinkedListState<LinkedListItem>,
  item: LinkedListItem,
): LinkedListItem => {
  state.private.length++;

  const existing = state.private.tail;
  const newItem = {item, next: null};

  state.private.tail = newItem;

  if (existing) existing.next = newItem;
  // Queue was empty, so new item is also the head
  else state.private.head = newItem;

  console.log('Head:', state.private.head && state.private.head.item);
  console.log('Tail', state.private.tail && state.private.tail.item);
  console.log('Length:', state.private.length);

  return newItem.item;
};

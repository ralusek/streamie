// Types
import { LinkedListState, LinkedListItemContainer } from '@root/utils/LinkedList/types';
import { LinkedListShiftConfig } from "./types";


/**
   * Attempts to shift an item off the head of the queue.
   * @param state - The LinkedListState
   * @param config - The shift configuration.
   * @returns LinkedListItem if the shift was possible/allowed.
   */
export default <LinkedListItem>(
  state: LinkedListState<LinkedListItem>,
  {
    batchSize = 1
  }: LinkedListShiftConfig = {}
): LinkedListItem[] => {
  const shifted: LinkedListItem[] = [];

  if ((batchSize < 1) || isNaN(batchSize)) return shifted;

  let head: LinkedListItemContainer<LinkedListItem> | null = state.private.head;
  for (let i = 0; i < batchSize && head; i++) {
    shifted.push(head.item);
    head = head.next;
  }

  if (head) state.private.head = head;
  // Queue is empty now, so de-reference head and tail.
  else {
    state.private.head = null;
    state.private.tail = null;
  }

  state.private.length -= batchSize;

  console.log('Head:', state.private.head && state.private.head.item);
  console.log('Tail', state.private.tail && state.private.tail.item);
  console.log('Length:', state.private.length);

  return shifted;
};

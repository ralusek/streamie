import { LinkedListShiftConfig } from './public/methods/shift/types';

export type LinkedListState<LinkedListItem> = {
  private: LinkedListPrivateState<LinkedListItem>,
  public: LinkedList<LinkedListItem>,
};

export type LinkedList<LinkedListItem> = {
  length: number,
  /**
   * Push an item into the tail of the queue O(1)
   * @param item - The item to push into the queue.
   * @returns - The LinkedListItem for the Item that was added to the queue.
   */
  push: (item: LinkedListItem) => LinkedListItem,
  /**
   * Attempts to shift an item off the head of the queue.
   * O(M), where M is the amount of items removed.
   * @returns LinkedListItem if the shift was possible/allowed.
   */
  shift: (config?: LinkedListShiftConfig) => LinkedListItem[]
};

/**
 * The private namespace for instances of LinkedList
 */
export type LinkedListPrivateState<LinkedListItem> = {
  /** The first item in the queue. Will be replaced by the next item in the event of a .shift() */
  head: LinkedListItemContainer<LinkedListItem> | null,
  /** The last item in the queue. Will be replaced by a new item in the event of a .push() */
  tail: LinkedListItemContainer<LinkedListItem> | null,
  /** The length of the queue. */
  length: number,
};


/**
 * A container for a LinkedListItem for facilitating linked list implementation
 */
export type LinkedListItemContainer<LinkedListItem> = {
  item: LinkedListItem,
  next: LinkedListItemContainer<LinkedListItem> | null,
};

/**
 * The private namespace for instances of LinkedList
 */
export type LinkedListPrivateNamespace<LinkedListItem> = {
  /** The first item in the queue. Will be replaced by the next item in the event of a .shift() */
  head?: LinkedListItemContainer<LinkedListItem>,
  /** The last item in the queue. Will be replaced by a new item in the event of a .push() */
  tail?: LinkedListItemContainer<LinkedListItem>,
  /** The length of the queue. */
  length: number,
};


/**
 * A container for a LinkedListItem for facilitating linked list implementation
 */
export type LinkedListItemContainer<LinkedListItem> = {
  item: LinkedListItem,
  next?: LinkedListItemContainer<LinkedListItem>
};

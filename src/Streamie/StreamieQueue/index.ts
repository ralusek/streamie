// Types
import { Item } from "../types";
import {
  StreamieQueuePrivateNamespace,
  StreamieQueueItemContainer,
  StreamieQueueItem,
  StreamieQueueConfig
} from "./types";

// Utils
import namespace, { P } from '@root/utils/namespace';
import _createQueueItemContainer from "./methods/private/_createQueueItemContainer";


// Method for private namespacing.
const p: P<StreamieQueue, StreamieQueuePrivateNamespace> = namespace();


/**
 * A linked-list implementation of a queue for O(1) push and shift.
 */
export class StreamieQueue {
  constructor({canAutoAdvance = true}: StreamieQueueConfig = {}) {
    p(this).head;
    p(this).tail;
    p(this).canAutoAdvance = canAutoAdvance;

    p(this).length = 0;
    p(this).itemsPermittedToAdvance = 0;
  }

  /**
   * Permit the advancement (shifting) of a queue item.
   */
  advance():void {
    p(this).itemsPermittedToAdvance++;
  }

  /**
   * Push an item into the tail of the queue O(1)
   * @param item - The item to push into the queue.
   * @returns - The StreamieQueueItem for the Item that was added to the queue.
   */
  push(item: Item): StreamieQueueItem {
    p(this).length++;

    const existing: StreamieQueueItemContainer = p(this).tail;
    const newItem:StreamieQueueItemContainer = _createQueueItemContainer(item);

    p(this).tail = newItem;

    if (existing) existing.next = newItem;
    // Queue was empty, so this item is also the head
    else p(this).head = newItem;

    console.log('Head:', p(this).head && p(this).head.queueItem.item);
    console.log('Tail', p(this).tail && p(this).tail.queueItem.item);
    console.log('Length:', p(this).length);

    return newItem.queueItem;
  }

  /**
   * Get the amount of items currently in the queue.
   * @returns - The length of the queue.
   */
  get length(): number {
    return p(this).length;
  }

  /**
   * Attempts to shift an item off the head of the queue O(1)
   * @returns StreamieQueueItem if the shift was possible/allowed.
   */
  shift(): StreamieQueueItem | undefined {
    const existing: StreamieQueueItemContainer = p(this).head;
    if (!existing) return; // No queue items, empty shift.

    if (p(this).itemsPermittedToAdvance) p(this).itemsPermittedToAdvance--;
    // No items permitted to advance, and auto advance not enabled.
    else if (!p(this).canAutoAdvance) return;

    p(this).length--;

    const next: StreamieQueueItemContainer = existing.next;

    if (next) p(this).head = existing.next;
    // Queue is empty now, so de-reference head and tail.
    else {
      p(this).head = undefined;
      p(this).tail = undefined;
    }

    console.log('Head:', p(this).head && p(this).head.queueItem.item);
    console.log('Tail', p(this).tail && p(this).tail.queueItem.item);
    console.log('Length:', p(this).length);

    return existing.queueItem;
  }
}

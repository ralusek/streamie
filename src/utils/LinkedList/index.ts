// Types
import {
  LinkedListPrivateNamespace
} from './types';
import { LinkedListShiftConfig } from './methods/public/shift/types';

// Utils
import namespace, { P } from '@root/utils/namespace';

// Public Methods
import shift from './methods/public/shift';
import push from './methods/public/push';


// Method for private namespacing.
const p: P<LinkedList<any>, LinkedListPrivateNamespace<any>> = namespace();


/**
 * A linked-list implementation of a queue for O(1) push and shift.
 */
export class LinkedList<LinkedListItem> {
  constructor() {
    p(this).head;
    p(this).tail;

    p(this).length = 0;
  }

  /**
   * Get the amount of items currently in the queue.
   * @returns - The length of the queue.
   */
  get length(): number {
    return p(this).length;
  }

  /**
   * Push an item into the tail of the queue O(1)
   * @param item - The item to push into the queue.
   * @returns - The LinkedListItem for the Item that was added to the queue.
   */
  push(item: LinkedListItem): LinkedListItem {
    return push<LinkedListItem>(p, this, item);
  }



  /**
   * Attempts to shift an item off the head of the queue O(1)
   * @returns LinkedListItem if the shift was possible/allowed.
   */
  shift(config?: LinkedListShiftConfig) {
    return shift<LinkedListItem>(p, this, config);
  }
}

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

// Public Methods
import shift from "./methods/public/shift";
import push from "./methods/public/push";


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
   * Get the amount of items currently in the queue.
   * @returns - The length of the queue.
   */
  get length(): number {
    return p(this).length;
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
    return push(p, this, item);
  }



  /**
   * Attempts to shift an item off the head of the queue O(1)
   * @returns StreamieQueueItem if the shift was possible/allowed.
   */
  shift(): StreamieQueueItem | undefined {
    return shift(p, this);
  }
}

// Types
import {
  StreamieQueuePrivateNamespace,
  StreamieQueueItem,
  StreamieQueueConfig
} from './types';

// Utils
import namespace, { P } from '@root/utils/namespace';

// Public Methods
import shift from './methods/public/shift';
import push from './methods/public/push';
import { LinkedList } from '@root/utils/LinkedList';
import advance from './methods/public/advance';


// Method for private namespacing.
const p: P<StreamieQueue, StreamieQueuePrivateNamespace> = namespace();


/**
 * A linked-list implementation of a queue for O(1) push and shift.
 */
export class StreamieQueue<StreamieInputItem = any, StreamieOutputItem = any> {
  constructor({canAutoAdvance = true}: StreamieQueueConfig = {}) {
    p(this).advancedPlaceholders = new LinkedList();
    p(this).queued = new LinkedList<StreamieInputItem>();
    p(this).handling = new Set<StreamieInputItem>();

    p(this).canAutoAdvance = canAutoAdvance;
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
  advance(): Promise<StreamieOutputItem> {
    return advance<
      StreamieQueue<StreamieInputItem, StreamieOutputItem>,
      StreamieOutputItem
    >(p, this);
  }

  /**
   * Push an item into the tail of the queue O(1)
   * @param item - The item to push into the queue.
   * @returns - The StreamieQueueItem for the Item that was added to the queue.
   */
  push(item: StreamieInputItem): StreamieQueueItem<StreamieInputItem> {
    return push(p, this, item);
  }



  /**
   * Attempts to shift an item off the head of the queue O(1)
   * @returns StreamieQueueItem if the shift was possible/allowed.
   */
  shift(): StreamieQueueItem<StreamieInputItem, StreamieOutputItem> | undefined {
    return shift(p, this);
  }
}

// Types
import { defer, DeferredWithPromise } from '@root/utils/defer';
import { Item } from '@root/Streamie/types';
import { QueueItemPrivateNamespace } from './types';

// Utils
import namespace, { P } from '@root/utils/namespace';


// Method for private namespacing.
const p:P<QueueItem, QueueItemPrivateNamespace> = namespace();


/**
 * A queue item to be used in a Streamie queue.
 */
export class QueueItem {
  // Can alternatively be declared like this:
  // public deferred:DeferredWithPromise;

  constructor(item:Item) {
    // Private properties.
    p(this).item = item;
    p(this).createdAt = Date.now();
    p(this).deferred = defer();
  }

  get deferred():DeferredWithPromise {
    return p(this).deferred;
  }
}

// Types
import { Handler, HandlerResult, Item, StreamieConfig, StreamiePrivateNamespace } from './types';
import { FilterConfig } from './methods/public/filter/types';

// Classes
import { QueueItem } from '@root/QueueItem';

// Utils
import namespace, { P } from '@root/utils/namespace';

// Public Methods
import filter from './methods/public/filter';
import push from './methods/public/push';


// Method for private namespacing.
const p:P<Streamie, StreamiePrivateNamespace> = namespace();


/**
 * The Streamie class.
 */
export default class Streamie {
  constructor(
    handler:Handler,
    config?: StreamieConfig
  ) {
    // Store references.
    p(this).handler = handler;

    // Create data containers.
    p(this).queue = []; // The QueueItems which have yet to be handled or are currently handling.
    p(this).handling = new Set(); // The QueueItems being handled.
    p(this).children = new Set(); // The Streamies downstream
  }

  /**
   * Push a new item into the stream.
   */
  push(item:Item): Promise<HandlerResult> {
    return push(p, this, item);
  }

  /**
   * Returns a streamie which will only output results which pass the provided
   * predicate, which defaults to truthiness.
   */
  filter(handler:Handler, config:FilterConfig):Streamie {
    return filter(p, this, handler, config);
  }
}

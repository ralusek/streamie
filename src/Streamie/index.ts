// Types
import { Handler, HandlerResult, Item, StreamieConfig, StreamiePrivateNamespace } from './types';
import { MapConfig } from './methods/public/map/types';
import { FilterConfig } from './methods/public/filter/types';

// Utils
import namespace, { P } from '@root/utils/namespace';

// Public Methods
import filter from './methods/public/filter';
import push from './methods/public/push';
import map from './methods/public/map';


// Method for private namespacing.
const p: P<Streamie, StreamiePrivateNamespace> = namespace();


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
    p(this).children = new Set(); // The downstream child Streamies
  }

  /**
   * Push a new item into the stream.
   * @param item - The Item to push into the queue.
   * @returns A promise containing the result from the Handler.
   */
  push(item:Item): Promise<HandlerResult> {
    return push(p, this, item);
  }

  /**
   * Returns a streamie which will map over each handler item, as normal.
   * @param handler - The handler to execute for a given QueueItem
   * @param config - The configuration options
   * @returns The new child streamie.
   */
  map (handler: Handler, config: MapConfig): Streamie {
    return map(p, this, handler, config);
  };


  /**
   * Returns a streamie which will only output results which pass the provided
   * predicate, which defaults to truthiness.
   * @param handler - The handler to execute for a given QueueItem
   * @param config - The configuration options
   * @returns The new child streamie.
   */
  filter(handler:Handler, config:FilterConfig):Streamie {
    return filter(p, this, handler, config);
  }
}

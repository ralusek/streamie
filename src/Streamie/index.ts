import { Streamie, StreamieHandler, StreamieConfig, StreamieState } from './types';


// Bootstrappers.
import bootstrapPrivateState from './private';
import bootstrapPublicState from './public';


/**
 * Streamie factory function.
 */
export default <InputItem, OutputItem>(
  handler: StreamieHandler<InputItem, OutputItem>,
  config: Partial<StreamieConfig>
): Streamie<InputItem, OutputItem> => {
  const built: any = {};

  const state: StreamieState<InputItem, OutputItem> = {
    get private() { return built.private || (built.private = bootstrapPrivateState(state, handler, config)); },
    get public() { return built.public || (built.public = bootstrapPublicState(state, config)); }
  };

  return state.public;
};

// // Types
// import { Handler, HandlerResult, Item, StreamieConfig, StreamiePrivateNamespace } from './types';
// import { StreamieStatePublic } from './StreamieState/types';
// import { MapConfig } from './methods/public/map/types';
// import { FilterConfig } from './methods/public/filter/types';
// import { EventName, EventCallback, EventCallbackWithEventName } from '@root/utils/Emittie/types';

// // Utils
// import namespace, { P } from '@root/utils/namespace';

// // Classes
// import StreamieState from './StreamieState';
// import Emittie from '@root/utils/Emittie';

// // Public Methods
// import filter from './methods/public/filter';
// import push from './methods/public/push';
// import map from './methods/public/map';

// // Event Names
// import * as EVENT_NAMES from './events/constants';

// // Event Handlers
// import bootstrapEventHandlers from './events/bootstrapEventHandlers/streamie';
// import bootstrapStateEventHandlers from './events/bootstrapEventHandlers/state';
// import _createDefaultConfiguration from './methods/private/_createDefaultConfiguration';


// // Method for private namespacing.
// const p: P<Streamie, StreamiePrivateNamespace> = namespace();


// /**
//  * The Streamie class.
//  */
// export default class Streamie {
//   constructor(
//     handler:Handler,
//     config: StreamieConfig = {}
//   ) {
//     p(this).emittie = new Emittie();

//     // Store references.
//     p(this).handler = handler;

//     // Handle configuration.
//     p(this).config = _createDefaultConfiguration(config);

//     // Create data containers.
//     p(this).state = new StreamieState(p(this).config);


//     // Bootstrap event listeners
//     bootstrapEventHandlers(p, this);
//     bootstrapStateEventHandlers(p, this);
//   }

//   /**
//    * Get the state in a publicly formatted structure.
//    * @returns The public state.
//    */
//   get state(): StreamieStatePublic {
//     return p(this).state.readable;
//   }

//   /**
//    * Reference to Event constants.
//    * @returns Event constants
//    */
//   get EVENT(): { [key: string]: EventName } {
//     return EVENT_NAMES;
//   }

//   /**
//    * Register an event listener for public events by event name.
//    * @param eventName - The event name for whic to register a callback
//    * @param callback - The callback to invoke on event emitted
//    */
//   on(eventName: EventName, callback: EventCallback) {
//     return p(this).emittie.on(eventName, callback);
//   }

//   /**
//    * Register an event listener for all events.
//    * @param callback - The callback to invoke on event emitted
//    */
//   onAny(callback: EventCallbackWithEventName) {
//     return p(this).emittie.onAny(callback);
//   }

//   /**
//    * Push a new item into the stream.
//    * @param item - The Item to push into the queue.
//    * @returns A promise containing the result from the Handler.
//    */
//   push(item:Item): Promise<HandlerResult> {
//     return push(p, this, item);
//   }

//   /**
//    * Returns a streamie which will map over each handler item, as normal.
//    * @param handler - The handler to execute for a given QueueItem
//    * @param config - The configuration options
//    * @returns The new child streamie.
//    */
//   map(handler: Handler, config: MapConfig): Streamie {
//     return map(p, this, handler, config);
//   };


//   /**
//    * Returns a streamie which will only output results which pass the provided
//    * predicate, which defaults to truthiness.
//    * @param handler - The handler to execute for a given QueueItem
//    * @param config - The configuration options
//    * @returns The new child streamie.
//    */
//   filter(handler:Handler, config:FilterConfig):Streamie {
//     return filter(p, this, handler, config);
//   }
// }

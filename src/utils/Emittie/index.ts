// Types
import { EventName, EventCallback, EventPayload, EmittiePrivateNamespace, EventCallbackWithEventName } from './types';

// Utils
import namespace, { P } from '@root/utils/namespace';

// Private Methods
import _addOnCallback from './methods/private/_addOnCallback';

// Public Methods
import on from './methods/public/on';
import emit from './methods/public/emit';
import onAny from './methods/public/onAny';

// Method for private namespacing.
const p:P<Emittie, EmittiePrivateNamespace> = namespace();


/**
 *
 */
export default class Emittie {
  constructor() {
    p(this).callbacks = {
      on: new Map(),
      onAny: []
    };
  }

  /**
   * Associates a callback with a given event name.
   * @param name - The EventName to register the callback for
   * @param callback - The EventCallback to associate with the EventName
   */
  on(name: EventName, callback: EventCallback): void {
    on(p, this, name, callback);
  }

  /**
  * Associates a callback with all events.
  * @param callback - The EventCallbackWithEventName to associate with the EventName
  */
  onAny(callback: EventCallbackWithEventName): void {
    onAny(p, this, callback);
  }

 /**
  * Emits an event by invoking the callbacks associated with the EventName with
  * the provided EventPayload(s).
  * @param name - The EventName whose associated callbacks should be invoked with the payload(s)
  * @param payloads - The EventPayload(s) with which to invoke the associated callbacks
  */
  emit(name: EventName, ...payloads: EventPayload[]): void {
    emit(p, this, name, ...payloads);
  }
}

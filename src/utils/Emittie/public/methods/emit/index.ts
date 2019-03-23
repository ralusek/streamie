// Types
import { EmittieState, EventPayload, EventCallbackWithEventName, EventCallback } from '@root/utils/Emittie/types';


/**
 * Emits an event by invoking the callbacks associated with the EventName with
 * the provided EventPayload(s).
 * @param state - The Emittie state.
 * @param name - The EventName to register the callback for
 * @param payloads - The EventPayload(s) with which to invoke the associated callbacks
 */
export default <EventNameType extends string | symbol, PayloadType>(
  state: EmittieState<EventNameType>,
  name: EventNameType,
  ...payloads: EventPayload<PayloadType>[]
): void => {
  const onCallbacks = state.private.callbacks.on[name];
  if (onCallbacks) onCallbacks.forEach((callback: EventCallback) => callback(...payloads));

  const onAnyCallbacks = state.private.callbacks.onAny;
  onAnyCallbacks.forEach((callback: EventCallbackWithEventName<EventNameType>) => callback(name, ...payloads));
};

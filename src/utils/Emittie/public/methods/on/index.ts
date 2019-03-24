// Types
import { EmittieState, EventCallback } from '@root/utils/Emittie/types';


/**
 * Associates a callback with a given event name.
 * @param state - The Emittie state.
 * @param name - The EventName to register the callback for
 * @param callback - The EventCallback to associate with the EventName
 */
export default <EventNameType extends string | symbol>(
  state: EmittieState<EventNameType>,
  name: EventNameType,
  callback: EventCallback,
): void => {
  const callbackSets = state.private.callbacks.on;
  if (!callbackSets[name]) callbackSets[name] = [];
  (callbackSets[name] as EventCallback[]).push(callback);
};

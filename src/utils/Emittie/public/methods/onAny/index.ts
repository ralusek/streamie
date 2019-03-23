// Types
import { EmittieState, EventCallbackWithEventName } from '@root/utils/Emittie/types';


/**
 * Associates a callback with all events.
 * @param state - The Emittie state.
 * @param callback - The EventCallback to associate with the EventName
 */
export default <EventNameType extends string | symbol>(
  state: EmittieState<EventNameType>,
  callback: EventCallbackWithEventName<EventNameType>,
): void => {
  state.private.callbacks.onAny.push(callback);
};

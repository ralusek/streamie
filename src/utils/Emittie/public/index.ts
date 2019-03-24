// Types
import { Emittie, EmittieState, EventCallback, EventCallbackWithEventName, EventPayload } from '../types';

// Public Methods
import on from './methods/on';
import onAny from './methods/onAny';
import emit from './methods/emit';


/**
 * Bootstraps the state properties and behaviors.
 * @param state The Emittie state.
 */
export default <EventNameType extends string | symbol>(
  state: EmittieState<EventNameType>,
): Emittie<EventNameType> => {
  const publicState: Emittie<EventNameType> = {

    on(name: EventNameType, callback: EventCallback): void {
      on<EventNameType>(state, name, callback);
    },
    onAny(callback: EventCallbackWithEventName<EventNameType>): void {
      onAny(state, callback);
    },
    emit(name: EventNameType, ...payloads: EventPayload[]): void {
      emit(state, name, ...payloads);
    },
  }

  return publicState;
};

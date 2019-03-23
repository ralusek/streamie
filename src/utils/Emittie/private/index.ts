// Types
import { EmittiePrivateState, EmittieState } from '../types';


/**
 * Bootstraps the state properties and behaviors.
 */
export default <EventNameType extends string | symbol>(
  state: EmittieState<EventNameType>,
): EmittiePrivateState<EventNameType> => {
  const privateState: EmittiePrivateState<EventNameType> = {
    callbacks: {
      on: {},
      onAny: []
    },
  };

  return privateState;
};

// Types
import { Emittie, EmittieState } from './types';

// Bootstrappers.
import bootstrapPrivateState from './private';
import bootstrapPublicState from './public';



/**
 * Emittie factory function.
 */
export default <EventNameType extends string | symbol = string>(
): Emittie<EventNameType> => {
  const built: any = {};

  const state: EmittieState<EventNameType> = {
    get private() { return built.private || (built.private = bootstrapPrivateState(state)); },
    get public() { return built.public || (built.public = bootstrapPublicState(state)); }
  };

  return state.public;
};

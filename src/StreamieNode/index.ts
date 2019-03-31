import { StreamieNodeState, StreamieNodeHandlerInput, StreamieNodeConfig } from './types';

import bootstrapprotectedState from './protected';
import bootstrapPublicState from './public';

export default <I, O, HandlerState = any>(
  handlers: StreamieNodeHandlerInput<I, O>,
  config: StreamieNodeConfig<HandlerState>,
) => {
  const built: any = {};

  const state: StreamieNodeState<I, O> = {
    get protected() { return built.protected || (built.protected = bootstrapprotectedState(state, handlers)); },
    get public() { return built.public || (built.public = bootstrapPublicState(state)); }
  };

  return state.public;
};
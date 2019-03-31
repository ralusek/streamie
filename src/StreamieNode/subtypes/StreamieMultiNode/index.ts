// Types
import { StreamieMultiNodeState } from './types';
import { StreamieNodeState, StreamieNodeHandler } from '@root/StreamieNode/types';

import bootstrapPrivateState from './private';
import bootstrapPublicState from './public';


export default <I, O>(rootState: StreamieNodeState<I, O>, handlers: StreamieNodeHandler<I, O>[]) => {
  const built: any = {};

  const state: StreamieMultiNodeState<I, O> = {
    get private() { return built.private || (built.private = bootstrapPrivateState(state)); },
    get public() { return built.public || (built.public = bootstrapPublicState(state)); }
  };

  return state.public;
};
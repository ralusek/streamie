// Types
import { StreamieFunctionNodeState, StreamieHandlerFunction } from './types';
import { StreamieNodeState } from '@root/StreamieNode/types';
import { StreamieFunctionNode } from './public/types';

import bootstrapPrivateState from './private';
import bootstrapPublicState from './public';


export default <I, O>(
  rootState: StreamieNodeState<I, O>,
  handler: StreamieHandlerFunction<I, O>
): StreamieFunctionNode<I, O> => {
  const built: any = {};

  const state: StreamieFunctionNodeState<I, O> = {
    root: rootState,
    subtype: {
      get private() { return built.private || (built.private = bootstrapPrivateState(state, handler)); },
      get public() { return built.public || (built.public = bootstrapPublicState(state)); }
    },
  };

  return state.subtype.public;
};
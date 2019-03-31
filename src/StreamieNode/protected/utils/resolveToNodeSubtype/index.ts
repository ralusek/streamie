// Types
import { StreamieNodeHandlerInput, StreamieNodeState } from '@root/StreamieNode/types';

// Utils
import createStreamieFunctionNode from '@root/StreamieNode/subtypes/StreamieFunctionNode';
import createStreamieMultiNode from '@root/StreamieNode/subtypes/StreamieMultiNode';

export default <I, O>(
  state: StreamieNodeState<I, O>,
  handlers: StreamieNodeHandlerInput<I, O>,
) => {
  if (Array.isArray(handlers)) return createStreamieMultiNode<I, O>(state, handlers);
  else return createStreamieFunctionNode<I, O>(state, handlers);
  // else if (typeof handlers === 'function') return createStreamieFunctionNode<I, O>(state, handlers);
};

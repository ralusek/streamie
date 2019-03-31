// Types
import { StreamieFunctionNodeState } from '../types';
import { StreamieFunctionNode } from './types';

// Type Guards
import isPromiseLike from '@root/typeGuards/isPromiseLike';
import { StreamieNodeProtectedEventName } from '@root/StreamieNode/protected/events/types';

// Private Methods
import handleInput from '../private/methods/handleInput';


export default <I, O>(
  state: StreamieFunctionNodeState<I, O>,
): StreamieFunctionNode<I, O> => {
  const publicState: StreamieFunctionNode<I, O> = {
    // Methods
    push: (input: I, config) => handleInput(state, input, config),
  };

  return publicState;
};
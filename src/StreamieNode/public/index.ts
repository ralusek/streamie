import { StreamieNodeState } from '../types';
import { StreamieNode } from './types';
import createEmittie from '@root/utils/Emittie';

// Public methods
import push from './methods/push';

export default <I, O>(
  state: StreamieNodeState<I, O>,
): StreamieNode<I, O> => {
  const publicState: StreamieNode<I, O> = {
    emittie: createEmittie(),

    // Methods
    push: (...args) => push<I, O>(state, ...args),

    // Getters
    get id() { return state.protected.id },
  };

  return publicState;
};
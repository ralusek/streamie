import { StreamieMultiNodeState } from '../types';
import { StreamieMultiNode } from './types';

export default <I, O>(
  state: StreamieMultiNodeState<I, O>,
): StreamieMultiNode<I, O> => {
  const publicState: StreamieMultiNode<I, O> = {
    push: () => {},
  };

  return publicState;
};
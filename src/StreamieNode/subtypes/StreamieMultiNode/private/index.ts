// Types
import { StreamieMultiNodeState } from '../types';
import { StreamieMultiNodePrivateState } from './types';

export default <I, O>(
  state: StreamieMultiNodeState<I, O>,
): StreamieMultiNodePrivateState<I, O> => {
  const privateState: StreamieMultiNodePrivateState<I, O> = {
    // Methods
  };

  return privateState;
};
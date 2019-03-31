// Types
import { StreamieFunctionNodeState, StreamieHandlerFunction } from '../types';
import { StreamieFunctionNodePrivateState } from './types';

export default <I, O>(
  state: StreamieFunctionNodeState<I, O>,
  handler: StreamieHandlerFunction<I, O>,
): StreamieFunctionNodePrivateState<I, O> => {
  const privateState: StreamieFunctionNodePrivateState<I, O> = {
    handler
  };

  return privateState;
};
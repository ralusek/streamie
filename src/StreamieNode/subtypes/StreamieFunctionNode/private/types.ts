import { StreamieHandlerFunction } from '../types';

export type StreamieFunctionNodePrivateState<I, O> = {
  handler: StreamieHandlerFunction<I, O>
};
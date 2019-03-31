import { StreamieFunctionNodePrivateState } from './private/types';
import { StreamieFunctionNode } from './public/types';
import { StreamieNodeState, StreamieNodeEmitOutput, StreamieNodeHandlerState } from '@root/StreamieNode/types';
import { StreamieId } from '@root/utils/generateId';
import { StreamieNode } from '@root/StreamieNode/public/types';

/**
 *
 */
export type StreamieFunctionNodeState<I, O> = {
  root: StreamieNodeState<I, O>,
  subtype: {
    private: StreamieFunctionNodePrivateState<I, O>,
    public: StreamieFunctionNode<I, O>,
  },
};

/**
 * 
 */
export type StreamieHandlerFunction<I, O> = (input: I, meta: StreamieHandlerFunctionMeta<I, O>) => O | PromiseLike<O> | void;

/**
 * 
 */
export type StreamieHandlerFunctionMeta<I, O> = {
  inputId: StreamieId,
  streamie: StreamieNode<I, O>,
  output: StreamieNodeEmitOutput<O>,
  state: StreamieNodeHandlerState
};

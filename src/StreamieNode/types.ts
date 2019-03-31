import { StreamieNodeProtectedState } from './protected/types';
import { StreamieNode } from './public/types';
import { StreamieHandlerFunction } from './subtypes/StreamieFunctionNode/types';

/**
 *
 */
export type StreamieNodeState<I, O> = {
  protected: StreamieNodeProtectedState<I, O>,
  public: StreamieNode<I, O>,
};

/**
 * 
 */
export type StreamieNodeConfig<T> = {
  state: StreamieNodeHandlerState<T>,
};

/**
 * 
 */
// TODO add other handler types, like other streamie or a stream.
export type StreamieNodeHandler<I, O> = StreamieHandlerFunction<I, O>;

/**
 * 
 */
export type StreamieNodeHandlerInput<I, O> = StreamieNodeHandler<I, O> | StreamieNodeHandler<I, O>[];

/**
 * 
 */
export type StreamieNodeEmitOutput<O> = (output: O) => void;

/**
 * The persistent state provided to the node handler, persisted across executions.
 */
export type StreamieNodeHandlerState<T = any> = T;

import { StreamieMultiNodePrivateState } from './private/types';
import { StreamieMultiNode } from './public/types';

/**
 *
 */
export type StreamieMultiNodeState<I, O> = {
  private: StreamieMultiNodePrivateState<I, O>,
  public: StreamieMultiNode<I, O>,
};

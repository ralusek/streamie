// Types
import { StreamieId } from '../../utils/generateId';
import { DeferredWithPromise } from '@root/utils/defer';
import { StreamieFunctionNode } from '../subtypes/StreamieFunctionNode/public/types';
import { StreamieNodeProtectedEventName } from './events/types';
import { Emittie } from '@root/utils/Emittie/types';
import { StreamieMultiNode } from '../subtypes/StreamieMultiNode/public/types';
import { StreamieNodeHandlerState } from '../types';

export type StreamieNodeProtectedState<I, O> = {
  id: StreamieId,
  /** The persistent state available to the Streamie Node Handler across all executions. */
  handlerState: StreamieNodeHandlerState, // TODO: Allow this type to be provided/exposed by generic param?
  /** Protected Streamie Node event emitter */
  emittie: Emittie<StreamieNodeProtectedEventName>,
  /** Promises keyed by input id, resolved when item pushed in has been outputted. */
  deferred: {[key in StreamieId]: DeferredWithPromise<O>},

  /** The actual underlying node type instance. */
  node: StreamieFunctionNode<I, O> | StreamieMultiNode<I, O>,
};
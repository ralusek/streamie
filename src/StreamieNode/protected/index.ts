// Types
import { StreamieNodeState, StreamieNodeHandlerInput } from '../types';
import { StreamieNodeProtectedState } from './types';

// Utils.
import generateId from '../../utils/generateId';
import resolveToNodeSubtype from './utils/resolveToNodeSubtype';
import createEmittie from '@root/utils/Emittie';
import bootstrapProtectedEventHandlers from './events';


export default <I, O>(
  state: StreamieNodeState<I, O>,
  handlers: StreamieNodeHandlerInput<I, O>
): StreamieNodeProtectedState<I, O> => {
  const protectedState: StreamieNodeProtectedState<I, O> = {
    id: generateId(),
    handlerState: {},
    emittie: createEmittie(),
    deferred: {},

    node: resolveToNodeSubtype(state, handlers),
  };

  // Register event handlers
  bootstrapProtectedEventHandlers(state);

  return protectedState;
};
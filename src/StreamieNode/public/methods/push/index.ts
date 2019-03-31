// Types
import { StreamieNodeState } from '@root/StreamieNode/types';
import { StreamiePushConfig } from './types';

// Utils
import generateId, { StreamieId } from '@root/utils/generateId';
import { defer } from '@root/utils/defer';


/**
 * Push input into Streamie.
 * @param input The Streamie input item.
 */
export default <I, O>(
  state: StreamieNodeState<I, O>,
  input: I,
  {id = generateId()}: StreamiePushConfig = {}
): PromiseLike<O> => {
  const deferredWithPromise = defer<O>();
  state.protected.deferred[id] = deferredWithPromise;

  state.protected.node.push(input, {id});

  return deferredWithPromise.promise;
};

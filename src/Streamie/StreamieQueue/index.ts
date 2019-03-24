// Types
import {
  StreamieQueue,
  StreamieQueueState
} from './types';

// Bootstrappers.
import bootstrapPrivateState from './private';
import bootstrapPublicState from './public';


/**
 * StreamieQueue factory function.
 */
export default <InputItem, OutputItem>(
): StreamieQueue<InputItem, OutputItem> => {
  const built: any = {};

  const state: StreamieQueueState<InputItem, OutputItem> = {
    get private () { return built.private || (built.private = bootstrapPrivateState()); },
    get public () { return built.public || (built.public = bootstrapPublicState(state)); }
  };

  return state.public;
};

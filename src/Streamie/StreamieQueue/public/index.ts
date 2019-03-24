// Types
import { StreamieQueue, StreamieQueueState } from '../types';

// Public Methods
import advance from './methods/advance';
import shift from './methods/shift';
import push from './methods/push';

/**
 * Bootstraps the state properties and behaviors.
 */
export default <InputItem, OutputItem>(
  state: StreamieQueueState,
): StreamieQueue<InputItem, OutputItem> => {
  const publicState: StreamieQueue<InputItem, OutputItem> = {
    // Methods
    advance: () => advance<OutputItem>(state),
    push: (item) => push<InputItem, OutputItem>(state, item),
    shift: (batchSize) => shift<InputItem, OutputItem>(state, batchSize),

    // Derived
    get amountAdvanced() { return state.private.advancedPlaceholders.length; },
    get amountQueued() { return state.private.queued.length; },
  };

  return publicState;
};

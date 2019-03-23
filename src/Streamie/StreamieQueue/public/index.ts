// Types
import { StreamieQueueConfig, StreamieQueue, StreamieQueueState } from '../types';

// Public Methods
import advance from './methods/advance';
import shift from './methods/shift';
import push from './methods/push';

/**
 * Bootstraps the state properties and behaviors.
 */
export default <InputItem, OutputItem>(
  state: StreamieQueueState,
  config: StreamieQueueConfig
): StreamieQueue<InputItem, OutputItem> => {
  const publicState: StreamieQueue<InputItem, OutputItem> = {
    advance: () => advance<OutputItem>(state),
    push: (item) => push<InputItem, OutputItem>(state, item),
    // TODO implement isDraining
    shift: () => shift<InputItem>(state, { isDraining: false }),
  };

  return publicState;
};

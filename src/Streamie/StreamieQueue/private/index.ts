// Types
import { StreamieQueueConfig, StreamieQueuePrivateState, StreamieQueueAdvancedPlaceholder, StreamieQueueItem } from '../types';
import { LinkedList } from '@root/utils/LinkedList';

/**
 * Bootstraps the state properties and behaviors.
 */
export default <InputItem, OutputItem>({
  canAutoAdvance = true,
  batchSize = 1,
}: StreamieQueueConfig): StreamieQueuePrivateState<InputItem, OutputItem> => {
  const state = {
    advancedPlaceholders: new LinkedList<StreamieQueueAdvancedPlaceholder>(),
    queued: new LinkedList<StreamieQueueItem<InputItem, OutputItem>>(),
    handling: new Set<StreamieQueueItem<InputItem, OutputItem>>(),
    canAutoAdvance,
    batchSize,
  };

  return state;
};

// Types
import { StreamieQueuePrivateState, StreamieQueueAdvancedPlaceholder, StreamieQueueItem } from '../types';
import createLinkedList from '@root/utils/LinkedList';

/**
 * Bootstraps the state properties and behaviors.
 */
export default <InputItem, OutputItem>(

): StreamieQueuePrivateState<InputItem, OutputItem> => {
  const state = {
    advancedPlaceholders: createLinkedList<StreamieQueueAdvancedPlaceholder<OutputItem>>(),
    queued: createLinkedList<StreamieQueueItem<InputItem, OutputItem>>(),
  };

  return state;
};

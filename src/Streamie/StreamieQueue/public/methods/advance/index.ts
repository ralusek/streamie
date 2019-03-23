// Types
import {
  StreamieQueueState
} from '@root/Streamie/StreamieQueue/types';

// Utils
import { defer } from '@root/utils/defer';


/**
   * Advances a placeholder for a queue item to proceed. This pushes an item
   * into a queue, rather than just incrementing a value, in order for this
   * to return a promise corresponding to the resolution of whatever queue item
   * is specifically resolved as a consequence of this advancement.
   * @param state The StreamieQueue state.
   * @returns A promise corresponding to the resolution of the input handled as
   *          a consequence of this resolution.
   */
export default <OutputItem>(
  state: StreamieQueueState<any, OutputItem>
): Promise<OutputItem> => {
  const advancedPlaceholder = {
    createdAt: Date.now(),
    deferredHandler: defer<OutputItem>(),
  };

  state.private.advancedPlaceholders.push(advancedPlaceholder);

  return advancedPlaceholder.deferredHandler.promise;
};

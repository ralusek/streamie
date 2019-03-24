// Types
import { StreamieState } from '@root/Streamie/types';

// Private methods.
import handleBatch from '../handleBatch';

/**
 * Refreshes activity of the stream.
 * TODO consider adding a mechanism to bunch multiple refresh attempts in the same
 * tick together. Alternatively, a mechanism to return a "refresh id" prior to
 * doing something, and only refreshing if that refresh id hasn't changed (i.e. hasn't invoked)
 * @param state - The Streamie state
 */
export default <InputItem, OutputItem>(
  state: StreamieState<InputItem, OutputItem>,
): void => {
  if (!state.private.canHandle) return; // Exit refresh attempt if blocked.

  // Attempt to pull item off of queue, if available/allowed.
  const nextItems = state.private.queue.shift(state.private.config.batchSize);
  if (!nextItems.length) return; // Exit refresh attempt if no queue item available for processing.

  handleBatch(state, nextItems);
};

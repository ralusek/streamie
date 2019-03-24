// Types
import { StreamieState } from '@root/Streamie/types';


/**
 * Determines if the streamie is in a state where it can handle a batch.
 * @param state - The Streamie state
 * @returns Whether the streamie can handle a batch.
 */
export default <InputItem, OutputItem>(
  state: StreamieState<InputItem, OutputItem>,
): boolean => {
  // Check if any states explicitly prevent proceeding.
  if (
    state.private.isCompleted ||
    state.private.isStopped ||
    state.private.isPaused
  ) return false;

  // Check if currently at concurrency limit.
  if (state.private.handling.size >= state.private.config.concurrency) return false;

  let batchSize = state.private.config.batchSize;
  // Check if enough items have been queued to form a full batch, unless the
  // stream is draining (isCompleting).
  if (state.private.queue.amountQueued < batchSize) {
    if (!state.private.isCompleting) return false;
    batchSize = Math.min(batchSize, state.private.queue.amountQueued);
  }
  // Check if enough items have been advanced to form a full batch, unless
  // canAutoAdvance is true, or the stream is currently draining.
  if (state.private.queue.amountAdvanced < batchSize) {
    if (!state.private.isCompleting && !state.private.config.autoAdvance) return false;
  }
  // Check if all of the children are sufficiently backlogged so as to apply backpressure
  if (!state.private.canPushToChildren) return false;

  return true;
};

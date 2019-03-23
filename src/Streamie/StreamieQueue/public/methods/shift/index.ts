// Types
import { StreamieQueueState, StreamieQueueItem } from '@root/Streamie/StreamieQueue/types';


/**
 * Attempts to shift off batchSize amount of items from the queue. If there
 * aren't enough items queued to satisfy the full batch, the shift will return
 * empty, unless the queue is currently draining.
 * @returns StreamieQueueItem if the shift was possible/allowed.
 */
export default <InputItem>(
  state: StreamieQueueState<InputItem>,
  { isDraining = false }: {
    /** If draining the queue, and there are fewer items queued than the batchSize,
     *  they will still be shifted out. Normally, the batchSize acts as the minimum.
     */
    isDraining?: boolean
  } = {}
): StreamieQueueItem<InputItem>[] => {
  const { canAutoAdvance, advancedPlaceholders, queued, batchSize } = state.private;

  const available = queued.length;
  const advanced = advancedPlaceholders.length;

  // If we're not draining, return no items if available items are not yet a
  // full batchSize.
  if (available < batchSize && !isDraining) return [];

  // If there haven't been enough advances made to pair with the available count,
  // and canAutoAdvance is enabled, the difference will be automatically advanced,
  // otherwise the shift returns empty.
  if (advanced < available) {
    if (!isDraining && !canAutoAdvance) return [];
    for (let i = 0; i < (available - advanced); i++) {
      state.public.advance();
    }
  }

  const shiftAmount = Math.min(available, batchSize);

  return queued.shift({batchSize: shiftAmount});
};

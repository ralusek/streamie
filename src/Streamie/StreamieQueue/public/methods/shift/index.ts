// Types
import { StreamieQueueState, StreamieQueueOutput } from '@root/Streamie/StreamieQueue/types';


/**
 * Attempts to shift off batchSize amount of items from the queue. If there
 * aren't enough items queued to satisfy the full batch, the shift will return
 * empty, unless the queue is currently draining.
 * @param state The StreamieQueue state
 * @param batchSize The amount of items to shift
 * @returns StreamieQueueItem if the shift was possible/allowed.
 */
export default <InputItem, OutputItem>(
  state: StreamieQueueState<InputItem, OutputItem>,
  batchSize: number
): StreamieQueueOutput<InputItem, OutputItem>[] => {
  const { advancedPlaceholders, queued } = state.private;

  const available = queued.length;
  const advanced = advancedPlaceholders.length;

  const shiftAmount = Math.min(available, batchSize);

  // Automatically advance amount necessary amount to pair with queued.
  if (advanced < shiftAmount) {
    for (let i = 0; i < (shiftAmount - advanced); i++) {
      state.public.advance();
    }
  }

  const outputs = {
    advancedPlaceholders: advancedPlaceholders.shift({ batchSize: shiftAmount}),
    queueItems: queued.shift({ batchSize: shiftAmount })
  };

  return outputs.queueItems.map((queueItem, i) => {
    return {
      queueItem,
      advancedPlaceholder: outputs.advancedPlaceholders[i]
    };
  });
};

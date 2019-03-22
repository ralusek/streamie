// Types
import {
  StreamieQueueAdvancedPlaceholder, StreamieQueuePrivateNamespace
} from '@root/Streamie/StreamieQueue/types';
import { P } from '@root/utils/namespace';
import { StreamieQueue } from '@root/Streamie/StreamieQueue';
import { defer } from '@root/utils/defer';

/**
   * Attempts to shift an item off the head of the queue O(1)
   * TODO in order to work with batches, requests to shift should do nothing
   * while the queue.length < batchSize, at which point it should shift all of
   * them. The only time shift with queue.length < batchSize should not be
   * ignored is if queue is configured to be in drain mode, in which case it
   * should also prevent the .pushing of new items.
   * @param p - The private namespace getter
   * @param self - The StreamieQueue instance
   * @returns StreamieQueueItem if the shift was possible/allowed.
   */
export default <StreamieQueue extends object, StreamieItemOutput>(
  p: P<StreamieQueue, StreamieQueuePrivateNamespace>,
  self: StreamieQueue,
): Promise<StreamieItemOutput> => {
  const advancedPlaceholder = {
    createdAt: Date.now(),
    deferredHandler: defer<StreamieItemOutput>(),
  };

  p(this).advancedPlaceholders.push(advancedPlaceholder);

  return advancedPlaceholder.deferredHandler.promise;
};

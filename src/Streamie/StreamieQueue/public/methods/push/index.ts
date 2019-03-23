// Types
import {
  StreamieQueueState, StreamieQueueItem
} from '@root/Streamie/StreamieQueue/types';

// Utils
import { defer, DeferredWithPromise } from '@root/utils/defer';


/**
   * Pushes a new item into the queue for handling.
   * @param state The StreamieQueue state.
   * @returns The promise associated with the completion of the handling of this
   *          input.
   */
export default <InputItem, OutputItem>(
  state: StreamieQueueState<InputItem, OutputItem>,
  item: InputItem,
): StreamieQueueItem<InputItem, OutputItem> => {
  const queueItem: StreamieQueueItem<InputItem, OutputItem> = {
    item,
    createdAt: Date.now(),
    deferredHandler: defer<OutputItem>(),
  };

  state.private.queued.push(queueItem);

  return queueItem;
};

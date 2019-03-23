// Types
import { StreamieState } from '@root/Streamie/types';
import { EventName } from '@root/Streamie/private/events/types';


/**
 * Push a new item into the stream.
 * @param state - The Streamie state.
 * @param item - The Item to push into the queue.
 * @returns A promise containing the result from the Handler.
 */
export default <InputItem, OutputItem>(
  state: StreamieState<InputItem, OutputItem>,
  item: InputItem,
): Promise<OutputItem> => {
  const queueItem = state.private.queue.push(item);

  state.private.emittie.emit(EventName.ItemPushed);

  return queueItem.deferredHandler.promise;
};

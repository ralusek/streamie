// Types
import { StreamieState } from '@root/Streamie/types';
import { EventName } from '@root/Streamie/private/events/types';

// Type Guards
import { isMulti } from './typeguards';


/**
 * Push a new item into the stream.
 * @param state - The Streamie state.
 * @param item - The Item to push into the queue.
 * @returns A promise containing the result from the Handler.
 */
export default <InputItem, OutputItem>(
  state: StreamieState<InputItem, OutputItem>,
  item: InputItem | InputItem[],
): PromiseLike<OutputItem | OutputItem[]> => {
  const { config: { flatten }, queue } = state.private;

  const items = isMulti<InputItem>(item, flatten) ? item : [item];

  const promises = items.map(item => {
    const queueItem = queue.push(item);
    state.private.emittie.emit(EventName.ItemPushed);
    return queueItem.deferredHandler.promise;
  });

  // If the input is flattening multiple inputs, await all inputs to complete
  // handling. If not flattening, we will have just wrapped the item in a single
  // item array, so it should just be returned alone.
  return flatten ? Promise.all(promises) : promises[0];
};

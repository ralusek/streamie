// Types
import { StreamieQueueOutput } from '@root/Streamie/StreamieQueue/types';
import { StreamieHandlerResult, StreamieState } from '@root/Streamie/types';
import { EventName } from '../../events/types';


/**
 * Invokes the streamie handler on a queue item(s).
 * @param state - The Streamie state
 * @param queueItem - The streamie queue item with which to invoke the handler
 */
export default async <InputItem, OutputItem>(
  state: StreamieState<InputItem, OutputItem>,
  batch: StreamieQueueOutput<InputItem, OutputItem>[],
): Promise<StreamieHandlerResult<OutputItem> | null> => {
  const { batchSize } = state.private.config;
  state.private.handling.add(batch);

  const isBatch = batchSize > 1;
  const inputItems = batch.map(({queueItem: {item}}) => item);

  return Promise.resolve(state.private.handler(
    isBatch ? inputItems : inputItems[0],
    { streamie: state.public}
  ))
  .then((result) => {
    state.private.emittie.emit(EventName.BatchHandled, { batch, result });
    state.private.handling.delete(batch);
    return result;
  })
  .catch((err: Error) => {
    state.private.emittie.emit(EventName.BatchErrored, { batch, err });
    state.private.handling.delete(batch);
    return null;
  });
};

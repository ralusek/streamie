// Types
import { StreamieState, StreamieHandler } from '@root/Streamie/types';
import { MapConfig } from './types';
import { Streamie } from '../../types';

// Utils
import createStreamie from '@root/Streamie';

// Private Methods.
// import _addChildren from '../../private/_addChildren';

/**
 * Returns a streamie which will map over each handler item, as normal.
 * @param state - The Streamie state
 * @param handler - The handler to execute for a given QueueItem
 * @param config - The configuration options
 * @returns The new child streamie.
 */
export default <InputItem, OutputItem>(
  state: StreamieState<InputItem, OutputItem>,
  handler: StreamieHandler<InputItem, OutputItem>,
  config: MapConfig
): Streamie<InputItem, OutputItem> => {
  const child = createStreamie(handler, config);

  // _addChildren(p, self, child);

  return child;
};

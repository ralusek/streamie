import createStreamie from '@root/Streamie';

// Types
import { P } from '@root/utils/namespace';
import { Handler, StreamieState, Streamie } from '@root/Streamie/types';
import { MapConfig } from './types';

// Private Methods.
// import _addChildren from '../../private/_addChildren';

/**
 * Returns a streamie which will map over each handler item, as normal.
 * @param p - The private namespace getter
 * @param self - The Streamie instance
 * @param handler - The handler to execute for a given QueueItem
 * @param config - The configuration options
 * @returns The new child streamie.
 */
export default <InputItem, OutputItem>(
  state: StreamieState<InputItem, OutputItem>,
  handler: Handler<InputItem, OutputItem>,
  config: MapConfig
): Streamie<InputItem, OutputItem> => {
  const child = createStreamie(handler, config);

  // _addChildren(p, self, child);

  return child;
};

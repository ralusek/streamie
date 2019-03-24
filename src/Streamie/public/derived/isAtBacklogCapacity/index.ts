// Types
import { StreamieState } from '@root/Streamie/types';


/**
 * Determines if the streamie's backlog is at or exceeding the maximum specified capacity.
 * @param state - The Streamie state
 * @returns Whether the streamie's backlog is at capacity.
 */
export default <InputItem, OutputItem>(
  state: StreamieState<InputItem, OutputItem>,
): boolean => {
  const { config, queue } = state.private;
  return queue.amountQueued >= config.maxBacklogLength;
};

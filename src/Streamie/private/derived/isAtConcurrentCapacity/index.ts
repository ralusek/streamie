// Types
import { StreamieState } from '@root/Streamie/types';


/**
 * Determines if the streamie is currently handling the maximum specified by the
 * concurrency limit.
 * @param state - The Streamie state
 * @returns Whether the streamie is at concurrent capacity.
 */
export default <InputItem, OutputItem>(
  state: StreamieState<InputItem, OutputItem>,
): boolean => {
  const { config, handling } = state.private;
  return handling.size >= config.concurrency;
};

import { StreamieState } from '@root/Streamie/types';
import { BatchHandledPayload } from './types';



export default <InputItem, OutputItem>(
  state: StreamieState<InputItem, OutputItem>,
  {
    result,
    batch
  }: BatchHandledPayload<InputItem, OutputItem>
): void => {
  // if (state.private.canPushToChildren)
};

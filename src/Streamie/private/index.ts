// Types
import { StreamieState, Streamie, StreamieConfig, StreamieHandler, StreamiePrivateState } from '../types';

// Utils
import Emittie from '@root/utils/Emittie';
import createStreamieQueue from '../StreamieQueue';


/**
 * Bootstraps the state properties and behaviors.
 */
export default <InputItem, OutputItem>(
  state: StreamieState<InputItem, OutputItem>,
  handler: StreamieHandler<InputItem, OutputItem>,
  {
    concurrency = Infinity,
    batchSize = 1,
    flatten = false,
    shouldSaturateChildren = true,
    maxBacklogLength = 3 * concurrency,
  }: Partial<StreamieConfig>
): Streamie<InputItem, OutputItem> => {
  const privateState: StreamiePrivateState<InputItem, OutputItem> = {
    handler,
    config: {
      concurrency,
      batchSize,
      flatten,
      shouldSaturateChildren,
      maxBacklogLength,
    },
    queue: createStreamieQueue<InputItem, OutputItem>(),
    emittie: new Emittie()
  };

  return privateState;
};

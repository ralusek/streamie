// Types
import { StreamieState, StreamieConfig, StreamieHandler } from '../types';
import { StreamiePrivateState } from './types';

// Utils
import createEmittie from '@root/utils/Emittie';
import createStreamieQueue from '../StreamieQueue';

// Derived
import canHandle from './derived/canHandle';
import canPushToChildren from './derived/canPushToChildren';

// Events
import { bootstrap } from './events';


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
    autoAdvance = true,
  }: Partial<StreamieConfig>
): StreamiePrivateState<InputItem, OutputItem> => {
  const privateState: StreamiePrivateState<InputItem, OutputItem> = {
    handler,
    config: {
      concurrency,
      batchSize,
      flatten,
      shouldSaturateChildren,
      maxBacklogLength,
      autoAdvance,
    },

    children: new Set(),

    queue: createStreamieQueue(),
    emittie: createEmittie(),
    handling: new Set(),

    isCompleting: false,
    isPaused: false,
    isStopped: false,
    isCompleted: false,

    // Derived.
    get canHandle() { return canHandle(state); },
    get canPushToChildren() { return canPushToChildren(state); },
  };

  // Bootstrap event handlers:
  bootstrap(state);

  return privateState;
};

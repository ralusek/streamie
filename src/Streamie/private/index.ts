// Types
import { Streamie } from '../public/types';
import { StreamieState, StreamieConfig, StreamieHandler } from '../types';
import { EventName } from './events/types';

// Utils
import createEmittie from '@root/utils/Emittie';
import createStreamieQueue from '../StreamieQueue';

// Derived
import canHandle from './derived/canHandle';
import isAtConcurrentCapacity from './derived/isAtConcurrentCapacity';
import canPushToChildren from './derived/canPushToChildren';

// Events
import { bootstrap } from './events';
import { StreamieQueueOutput } from '../StreamieQueue/types';



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
) => {
  const privateState = {
    handler,
    config: {
      concurrency,
      batchSize,
      flatten,
      shouldSaturateChildren,
      maxBacklogLength,
      autoAdvance,
    },

    children: new Set<Streamie>(),

    queue: createStreamieQueue<InputItem, OutputItem>(),
    emittie: createEmittie<EventName>(),
    handling: new Set<StreamieQueueOutput<InputItem, OutputItem>[]>(),

    isCompleting: false,
    isPaused: false,
    isStopped: false,
    isCompleted: false,

    // Derived.
    get canHandle() { return canHandle(state); },
    get isAtConcurrentCapacity() { return isAtConcurrentCapacity(state); },
    get canPushToChildren() { return canPushToChildren(state); },
  };

  // Bootstrap event handlers:
  bootstrap(state);

  return privateState;
};

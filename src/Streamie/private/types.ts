import { EventName } from './events/types';
import createStreamiePrivateState from './index';

type CreateStreamiePrivateState = typeof createStreamiePrivateState;

export type StreamiePrivateState<InputItem, OutputItem> = ReturnType<CreateStreamiePrivateState<InputItem, OutputItem>>;


/**
 * The private namespace for instances of Streamie
 */
// export type StreamiePrivateState<InputItem = any, OutputItem = any> = {
//   emittie: Emittie<EventName>,
//   handler: StreamieHandler<InputItem, OutputItem>,
//   children: Set<Streamie>

//   config: StreamieConfig,
//   queue: StreamieQueue<InputItem, OutputItem>,
//   handling: Set<StreamieQueueOutput<InputItem, OutputItem>[]>,
``
//   // Derived
//   canHandle: boolean,
//   isAtConcurrentCapacity: boolean,
//   canPushToChildren: boolean,

//   isCompleting: boolean,
//   isPaused: boolean,
//   isStopped: boolean,
//   isCompleted: boolean,
// };

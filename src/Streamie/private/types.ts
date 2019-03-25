import { EventName } from './events/types';
import { Emittie } from '@root/utils/Emittie/types';
import { StreamieHandler, StreamieConfig } from '../types';
import { StreamieQueue, StreamieQueueOutput } from '../StreamieQueue/types';
import { Streamie } from '../public/types';


/**
* The private namespace for instances of Streamie
*/
export type StreamiePrivateState<InputItem, OutputItem> = {
  emittie: Emittie<EventName>,
  handler: StreamieHandler<InputItem, OutputItem>,
  children: Set<Streamie>

  config: StreamieConfig,
  queue: StreamieQueue<InputItem, OutputItem>,
  handling: Set<StreamieQueueOutput<InputItem, OutputItem>[]>,

  // Derived
  canHandle: boolean,
  isAtConcurrentCapacity: boolean,
  canPushToChildren: boolean,

  isCompleting: boolean,
  isPaused: boolean,
  isStopped: boolean,
  isCompleted: boolean,
};

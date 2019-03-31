// Types
import { StreamieNodeEventName } from './events/types';
import { StreamiePushConfig } from './methods/push/types';
import { Emittie } from '@root/utils/Emittie/types';
import { StreamieId } from '@root/utils/generateId';


export type StreamieNode<I = any, O = any> = {
  emittie: Emittie<StreamieNodeEventName>,

  // Methods
  push: (item: I, config: StreamiePushConfig) => PromiseLike<O>,

  // Getters
  id: StreamieId
};

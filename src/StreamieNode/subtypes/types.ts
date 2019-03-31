// Types
import { StreamieNodeState } from '../types';
import { Emittie } from '@root/utils/Emittie/types';
import { StreamieId } from '@root/utils/generateId';

export type StreamieNodeSubtype<I, O> = {
  // Trigger
  // emittie: Emittie,
  // Methods
  push: (input: I, config: StreamieNodeSubtypePushConfig) => void,
};

export type StreamieNodeSubtypePushConfig = {
  id: StreamieId,
};

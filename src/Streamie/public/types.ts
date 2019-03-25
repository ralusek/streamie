import { StreamieHandlerResult } from '../types';

/**
 * Streamie public state.
 */
export type Streamie<InputItem = any, OutputItem = any> = {
  // Methods
  push: (item: InputItem | InputItem[]) => PromiseLike<OutputItem | OutputItem[]>,

  // Derived
  isAtBacklogCapacity: boolean,
};

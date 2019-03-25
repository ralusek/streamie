// Types
import { StreamieState, StreamieConfig } from '../types';
import { Streamie } from './types';

// Derived
import isAtBacklogCapacity from './derived/isAtBacklogCapacity';

// Public Methods
import push from './methods/push';



/**
 * Bootstraps the state properties and behaviors.
 */
export default <InputItem, OutputItem>(
  state: StreamieState<InputItem, OutputItem>,
  config: Partial<StreamieConfig>
): Streamie<InputItem, OutputItem> => {
  const publicState: Streamie<InputItem, OutputItem> = {
    push: (item: InputItem | InputItem[]) => push<InputItem, OutputItem>(state, item),

    // Derived
    get isAtBacklogCapacity() { return isAtBacklogCapacity(state); },
  };

  return publicState;
};

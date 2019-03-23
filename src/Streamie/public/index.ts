// Types
import { StreamieState, Streamie, StreamieConfig, StreamieHandler } from '../types';

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
    push: (item: InputItem) => push<InputItem, OutputItem>(state, item),
  };

  return publicState;
};

// Types
import { LinkedListPrivateState, LinkedListState, LinkedListItemContainer } from '../types';


/**
 * Bootstraps the state properties and behaviors.
 */
export default <LinkedListItem>(
  state: LinkedListState<LinkedListItem>,
): LinkedListPrivateState<LinkedListItem> => {
  const privateState: LinkedListPrivateState<LinkedListItem> = {
    head: null,
    tail: null,
    length: 0,
  };

  return privateState;
};

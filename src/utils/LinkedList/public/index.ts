// Types
import { LinkedListState, LinkedList } from '../types';
import { LinkedListShiftConfig } from './methods/shift/types';

// Public Methods
import push from './methods/push';
import shift from './methods/shift';


/**
 * Bootstraps the state properties and behaviors.
 * @param state The LinkedList state.
 */
export default <LinkedListItem>(
  state: LinkedListState<LinkedListItem>,
): LinkedList<LinkedListItem> => {
  const publicState: LinkedList<LinkedListItem> = {
    get length() { return state.private.length },

    push: (item: LinkedListItem): LinkedListItem => push(state, item),
    shift: (config?: LinkedListShiftConfig): LinkedListItem[] => shift(state, config),
  };

  return publicState;
};

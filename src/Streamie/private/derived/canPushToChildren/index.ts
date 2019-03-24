// Types
import { StreamieState } from '@root/Streamie/types';


/**
 * Determines if the streamie's children are in a state where the streamie should
 * be able to push to them.
 * @param state - The Streamie state
 * @returns Whether the streamie can push to its children.
 */
export default <InputItem, OutputItem>(
  state: StreamieState<InputItem, OutputItem>,
): boolean => {
  const children = state.private.children;
  if (!children.size) return true;
  const { shouldSaturateChildren } = state.private.config;

  let count: number = 0;
  for (let child of children) {
    if (child.isAtBacklogCapacity) {
      // If children shouldn't be saturated, any child at capacity should indicate
      // that this stream cannot push to children.
      if (!shouldSaturateChildren) return false;
      count++;
    }
  }

  return count < children.size;
};

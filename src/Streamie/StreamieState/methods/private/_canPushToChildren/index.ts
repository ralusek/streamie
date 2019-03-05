// Types
import { P } from "@root/utils/namespace";
import StreamieState from "@root/Streamie/StreamieState";
import { StreamieStatePrivateNamespace } from "@root/Streamie/StreamieState/types";

/**
 * Determine if all of the downstream children are at backlog capacity.
 * @param p - The private namespace getter
 * @param self - The Streamie instance
 * @returns - Whether any children are at capacity.
 */
export default (p: P<StreamieState, StreamieStatePrivateNamespace>, self: StreamieState): boolean => {
  const children = self.children;
  if (!children.size) return true;
  const { shouldSaturateChildren } = p(self).config;

  let count: number = 0;
  for (let child of children) {
    if (child.state.isAtBacklogCapacity) {
      // If children shouldn't be saturated, any child at capacity should indicate
      // that this stream cannot push to children.
      if (!shouldSaturateChildren) return false;
      count++;
    }
  }
  return count < children.size;
};

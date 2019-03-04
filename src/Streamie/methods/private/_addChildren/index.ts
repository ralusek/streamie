// Types
import { P } from "@root/utils/namespace";
import Streamie from "@root/Streamie";
import { StreamiePrivateNamespace } from "@root/Streamie/types";

// Events
import { CONCURRENT_CAPACITY_REACHED, CHILD_CONCURRENT_CAPACITY_REACHED } from "@root/Streamie/events/constants";

/**
 * Add child stream to streamie.
 * @param p - The private namespace getter
 * @param self - The Streamie instance
 * @param child - The Streamie to add as a child
 */
export default (p:P<Streamie, StreamiePrivateNamespace>, self:Streamie, child:Streamie) => {
  _bootstrapEventListeners(p, self, child);

  p(this).state.children.add(child);
};

/**
 * Bootstrap child event listeners.
 * @private
 * @param p - The private namespace getter
 * @param self - The Streamie instance
 * @param child - The Streamie to add as a child
 */
function _bootstrapEventListeners(
  p: P<Streamie, StreamiePrivateNamespace>,
  self: Streamie,
  child: Streamie
): void {
  child.on(CONCURRENT_CAPACITY_REACHED, () => p(self).emittie.emit(CHILD_CONCURRENT_CAPACITY_REACHED));
}

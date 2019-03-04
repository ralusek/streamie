// Types
import { P } from "@root/utils/namespace";
import Streamie from "@root/Streamie";
import { StreamiePrivateNamespace } from "@root/Streamie/types";

// Events
import {
  ITEM_HANDLED,
  CHILD_ITEM_HANDLED,
  ITEM_PUSHED,
  CHILD_ITEM_PUSHED,
  PAUSED,
  CHILD_PAUSED
} from "@root/Streamie/events/constants";

/**
 * Add child stream to streamie.
 * @param p - The private namespace getter
 * @param self - The Streamie instance
 * @param child - The Streamie to add as a child
 */
export default (
  p:P<Streamie, StreamiePrivateNamespace>,
  self:Streamie,
  child:Streamie
): void => {
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
  child.on(PAUSED, () => p(self).emittie.emit(CHILD_PAUSED));
  child.on(ITEM_PUSHED, () => p(self).emittie.emit(CHILD_ITEM_PUSHED));
  child.on(ITEM_HANDLED, () => p(self).emittie.emit(CHILD_ITEM_HANDLED));
}

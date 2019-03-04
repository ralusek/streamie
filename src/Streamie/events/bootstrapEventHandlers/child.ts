import Streamie from "@root/Streamie";
import { P } from "@root/utils/namespace";
import { StreamiePrivateNamespace } from "@root/Streamie/types";
// Events
import {
  ITEM_HANDLED,
  CHILD_ITEM_HANDLED,
  ITEM_PUSHED,
  CHILD_ITEM_PUSHED,
  PAUSED,
  CHILD_PAUSED
} from "../constants";

/**
 * Bootstrap child event listeners.
 * @private
 * @param p - The private namespace getter
 * @param self - The Streamie instance
 * @param child - The Streamie to add as a child
 */
export default (
  p: P<Streamie, StreamiePrivateNamespace>,
  self: Streamie,
  child: Streamie
): void => {
  child.on(PAUSED, () => p(self).emittie.emit(CHILD_PAUSED));
  child.on(ITEM_PUSHED, () => p(self).emittie.emit(CHILD_ITEM_PUSHED));
  child.on(ITEM_HANDLED, () => p(self).emittie.emit(CHILD_ITEM_HANDLED));
};

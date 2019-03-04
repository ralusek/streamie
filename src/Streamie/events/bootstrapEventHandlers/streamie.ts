import Streamie from "@root/Streamie";
import { P } from "@root/utils/namespace";
import { StreamiePrivateNamespace } from "@root/Streamie/types";

// Events
import {
  ITEM_HANDLED,
  ITEM_PUSHED
} from "../constants";

// Private methods
import _refresh from "@root/Streamie/methods/private/_refresh";

/**
 * Bootstrap streamie event listeners.
 * @private
 * @param p - The private namespace getter
 * @param self - The Streamie instance
 */
export default (
  p: P<Streamie, StreamiePrivateNamespace>,
  self: Streamie
): void => {
  self.on(ITEM_PUSHED, () => _refresh(p, self));
  self.on(ITEM_HANDLED, () => _refresh(p, self));
};

import Streamie from "@root/Streamie";
import { P } from "@root/utils/namespace";
import { StreamiePrivateNamespace, HandlerResult } from "@root/Streamie/types";

// Events
import {
  ITEM_HANDLED,
  ITEM_PUSHED
} from "../constants";

// Private methods
import _refresh from "@root/Streamie/methods/private/_refresh";
import _pushOutputToChildren from "@root/Streamie/methods/private/_pushOutputToChildren";

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

  self.on(ITEM_HANDLED, (output: HandlerResult, {error}: any = {}) => {
    // If the output of the item handling was not an error, propagate to children.
    if (!error) _pushOutputToChildren(p, self, output);
    _refresh(p, self);
  });
};

// Types
import Streamie from "@root/Streamie";
import { P } from "@root/utils/namespace";
import { StreamiePrivateNamespace, HandlerResult } from "@root/Streamie/types";
import { EventName, EventPayload } from "@root/Emittie/types";
import { EventHandler } from "../types";

// Events
import {
  ITEM_HANDLED,
  ITEM_PUSHED
} from "../constants";

// Private methods
import _refresh from "@root/Streamie/methods/private/_refresh";
import _pushOutputToChildren from "@root/Streamie/methods/private/_pushOutputToChildren";


// Establish Event Handlers
const HANDLER: Map<EventName, EventHandler> = new Map();

/** Handle streamie item pushed */
HANDLER.set(ITEM_PUSHED, (p, self) => _refresh(p, self));

/** Handle streamie item handled */
HANDLER.set(ITEM_HANDLED, (p, self, output: HandlerResult, { error }: any = {}) => {
  // If the output of the item handling was not an error, propagate to children.
  if (!error) _pushOutputToChildren(p, self, output);
  _refresh(p, self);
});


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
  p(self).emittie.onAny((eventName: EventName, ...payload: EventPayload[]) => {
    const handler = HANDLER.get(eventName);
    if (handler) handler(p, self, ...payload);
  });
};

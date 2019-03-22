import Streamie from "@root/Streamie";
import { P } from "@root/utils/namespace";
import { StreamiePrivateNamespace } from "@root/Streamie/types";
import { EventHandler } from "../types";
import { EventName } from "@root/utils/Emittie/types";

// Private Methods
import _refresh from "@root/Streamie/methods/private/_refresh";

// Events
import {
  RESUMED
} from "../constants";


// Establish Event Handlers
const HANDLER: Map<EventName, EventHandler> = new Map();

/** Handle streamie item pushed */
HANDLER.set(RESUMED, (p, self) => _refresh(p, self));


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
  child.on(RESUMED, () => HANDLER.get(RESUMED)(p, self));
};

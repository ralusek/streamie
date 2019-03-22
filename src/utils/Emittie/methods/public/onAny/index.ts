// Types
import Emittie from "@root/utils/Emittie";
import { EventCallback, EventName, EmittiePrivateNamespace, EventCallbackWithEventName } from "@root/utils/Emittie/types";
import { P } from "@root/utils/namespace";

// Private Methods
import _addOnCallback from "../../private/_addOnCallback";


/**
 * Associates a callback with all events.
 * @param p - The private namespace getter
 * @param self - The Emittie instance
 * @param callback - The EventCallback to associate with the EventName
 */
export default (
  p: P<Emittie, EmittiePrivateNamespace>,
  self: Emittie,
  callback: EventCallbackWithEventName
): void => {
  p(self).callbacks.onAny.push(callback);
};

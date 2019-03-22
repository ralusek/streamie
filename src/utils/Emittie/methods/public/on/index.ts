// Types
import Emittie from "@root/utils/Emittie";
import { EventCallback, EventName, EmittiePrivateNamespace } from "@root/utils/Emittie/types";
import { P } from "@root/utils/namespace";

// Private Methods
import _addOnCallback from "../../private/_addOnCallback";


/**
 * Associates a callback with a given event name.
 * @param p - The private namespace getter
 * @param self - The Emittie instance
 * @param name - The EventName to register the callback for
 * @param callback - The EventCallback to associate with the EventName
 */
export default (
  p: P<Emittie, EmittiePrivateNamespace>,
  self: Emittie,
  name: EventName,
  callback: EventCallback
): void => {
  _addOnCallback(p, self, name, callback);
};

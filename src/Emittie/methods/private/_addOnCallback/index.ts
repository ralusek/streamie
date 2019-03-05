// Types
import { P } from "@root/utils/namespace";
import Emittie from "@root/Emittie";
import { EventName, EventCallback, EmittiePrivateNamespace, EmittieCallbackSets } from "@root/Emittie/types";

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
  callback: EventCallback,
): void => {
  const callbackSets = p(self).callbacks.on;
  if (!callbackSets.has(name)) callbackSets.set(name, []);
  callbackSets.get(name).push(callback);
};

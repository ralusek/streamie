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
  callbackSet: (keyof EmittieCallbackSets),
  name: EventName,
  callback: EventCallback
): void => {
  if (!p(self).callbacks[callbackSet]) p(self).callbacks[callbackSet] = new Map();
  const callbackSets = p(self).callbacks[callbackSet];
  if (!callbackSets.has(name)) callbackSets.set(name, []);
  callbackSets.get(name).push(callback);
};

// Types
import { EventName, EventPayload, EventCallback, EmittiePrivateNamespace } from "@root/Emittie/types";
import { P } from "@root/utils/namespace";
import Emittie from "@root/Emittie";

/**
 * Emits an event by invoking the callbacks associated with the EventName with
 * the provided EventPayload(s).
 * @param p - The private namespace getter
 * @param self - The Emittie instance
 * @param name - The EventName whose associated callbacks should be invoked with the payload(s)
 * @param payloads - The EventPayload(s) with which to invoke the associated callbacks
 */
export default (
  p:P<Emittie, EmittiePrivateNamespace>,
  self:Emittie,
  name:EventName,
  ...payloads: EventPayload[]
): void => {
  const callbacks = p(self).callbacks.on.get(name);
  if (callbacks) callbacks.forEach((callback: EventCallback) => callback(...payloads));
};

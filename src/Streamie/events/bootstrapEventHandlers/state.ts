import Streamie from "@root/Streamie";
import { P } from "@root/utils/namespace";
import { StreamiePrivateNamespace } from "@root/Streamie/types";

// Events
import {
  PAUSED,
  STOPPED,
  COMPLETING,
  COMPLETED,
  RESUMED
} from "@root/Streamie/StreamieState/events/constants";
import {EventName, EventPayload } from "@root/Emittie/types";
import { EventHandler } from "../types";

// Private Methods
import _refresh from "@root/Streamie/methods/private/_refresh";

// Establish Event Handlers
const HANDLER: Map<EventName, EventHandler> = new Map();

/** Handle streamie state resumed. */
HANDLER.set(RESUMED, (p, self) => {
  _refresh(p, self);
});

// HANDLER.set(PAUSED, (p, self) => { });
// HANDLER.set(STOPPED, (p, self) => { });
// HANDLER.set(COMPLETING, (p, self) => { });
// HANDLER.set(COMPLETED, (p, self) => { });


/**
 * Bootstrap state event listeners.
 * @private
 * @param p - The private namespace getter
 * @param self - The Streamie instance
 */
export default (
  p: P<Streamie, StreamiePrivateNamespace>,
  self: Streamie
): void => {
  p(self).state.onAny((eventName: EventName, ...payload: EventPayload[]) => {
    const handler = HANDLER.get(eventName);
    if (handler) handler(p, self, ...payload);
  });
};

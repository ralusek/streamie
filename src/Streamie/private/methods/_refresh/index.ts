// Types
import { P } from "@root/utils/namespace";
import Streamie from "@root/Streamie";
import { StreamiePrivateNamespace } from "@root/Streamie/types";
import { StreamieInputItem } from "@root/Streamie/StreamieQueue/types";
import _handleQueueItem from "../_handleQueueItem";

/**
 * Refreshes activity of the stream.
 * TODO consider adding a mechanism to bunch multiple refresh attempts in the same
 * tick together. Alternatively, a mechanism to return a "refresh id" prior to
 * doing something, and only refreshing if that refresh id hasn't changed (i.e. hasn't invoked)
 * @param p - The private namespace getter
 * @param self - The Streamie instance
 */
export default (p:P<Streamie, StreamiePrivateNamespace>, self: Streamie): void => {
  if (!p(self).state.readable.canHandle) return; // Exit refresh attempt if blocked.

  // Attempt to pull item off of queue, if available/allowed.
  const next: StreamieInputItem = p(self).state.queue.shift();
  if (!next) return; // Exit refresh attempt if no queue item available for processing.

  _handleQueueItem(p, self, next);
};

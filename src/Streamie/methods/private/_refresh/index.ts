// Types
import { P } from "@root/utils/namespace";
import Streamie from "@root/Streamie";
import { StreamiePrivateNamespace } from "@root/Streamie/types";
import { StreamieQueueItem } from "@root/Streamie/StreamieQueue/types";
import _handleQueueItem from "../_handleQueueItem";

/**
 * Refreshes activity of the stream.
 * @param p - The private namespace getter
 * @param self - The Streamie instance
 */
export default (p:P<Streamie, StreamiePrivateNamespace>, self: Streamie): void => {
  if (p(self).state.readable.isBlocked) return; // Exit refresh attempt if blocked.

  // Attempt to pull item off of queue, if available/allowed.
  const next: StreamieQueueItem = p(self).state.queue.shift();
  if (!next) return; // Exit refresh attempt if no queue item available for processing.

  _handleQueueItem(p, self, next);
};

// Types
import { P } from "@root/utils/namespace";
import Streamie from "@root/Streamie";
import { StreamiePrivateNamespace, HandlerResult } from "@root/Streamie/types";
import { StreamieInputItem } from "@root/Streamie/StreamieQueue/types";
import { ITEM_HANDLED } from "@root/Streamie/events/constants";

/**
 * Invokes the streamie handler on a queue item.
 * @param p - The private namespace getter
 * @param self - The Streamie instance
 * @param queueItem - The streamie queue item with which to invoke the handler
 */
export default async (
  p: P<Streamie, StreamiePrivateNamespace>,
  self: Streamie,
  queueItem: StreamieInputItem
): Promise<HandlerResult> => {
  p(self).state.handling.add(queueItem);

  return Promise.resolve(p(self).handler(queueItem.item, {streamie: self}))
  .then((result: HandlerResult) => {
    p(self).emittie.emit(ITEM_HANDLED, result, {item: queueItem.item});
    queueItem.deferredHandler.deferred.resolve(result);
    _resolved();
  })
  .catch((err: Error) => {
    p(self).emittie.emit(ITEM_HANDLED, null, { item: queueItem.item, error: err });
    queueItem.deferredHandler.deferred.reject(err);
    _resolved();
    return Promise.reject(err);
  });

  function _resolved() {
    p(self).state.handling.delete(queueItem);
  }
};

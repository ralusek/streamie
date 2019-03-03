// Types
import { Item, HandlerResult, StreamiePrivateNamespace } from "@root/Streamie/types";
import { QueueItem } from "@root/QueueItem";
import { P } from "@root/utils/namespace";
import Streamie from "@root/Streamie";


/**
 * Push a new item into the stream.
 * @param p - The private namespace getter
 * @param self - The Streamie instance
 * @param item - The Item to push into the queue.
 * @returns A promise containing the result from the Handler.
 */
export default (
  p:P<Streamie, StreamiePrivateNamespace>,
  self:Streamie,
  item:Item
): Promise<HandlerResult> => {
  const queueItem: QueueItem = new QueueItem(item);
  p(self).queue.push(queueItem);

  return queueItem.deferred.promise;
}

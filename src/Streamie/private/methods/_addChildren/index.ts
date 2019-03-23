// Types
import { P } from "@root/utils/namespace";
import Streamie from "@root/Streamie";
import { StreamiePrivateNamespace } from "@root/Streamie/types";

// Event Handler
import bootstrapChildEventHandlers from '@root/Streamie/events/bootstrapEventHandlers/child';

/**
 * Add child stream to streamie.
 * @param p - The private namespace getter
 * @param self - The Streamie instance
 * @param child - The Streamie to add as a child
 */
export default (
  p:P<Streamie, StreamiePrivateNamespace>,
  self:Streamie,
  child:Streamie
): void => {
  bootstrapChildEventHandlers(p, self, child);

  p(self).state.children.add(child);
};

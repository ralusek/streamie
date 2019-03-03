import { P } from "@root/utils/namespace";
import Streamie from "@root/Streamie";
import { StreamiePrivateNamespace } from "@root/Streamie/types";

/**
 * Add child stream to streamie.
 */
export default (p:P<Streamie, StreamiePrivateNamespace>, self:Streamie, child:Streamie) => {
  p(this).children.add(child);
  // Do other stuff.
};

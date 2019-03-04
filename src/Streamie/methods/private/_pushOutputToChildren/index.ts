// Types
import { HandlerResult, StreamiePrivateNamespace } from "@root/Streamie/types";
import { P } from "@root/utils/namespace";
import Streamie from "@root/Streamie";


/**
 * Propagate output into all child streamies.
 * @param p - The private namespace getter
 * @param self - The Streamie instance
 * @param output - The handler's output to pass into child streamies.
 */
export default (
  p:P<Streamie, StreamiePrivateNamespace>,
  self: Streamie,
  output: HandlerResult
): void => {
  for (let child of p(self).state.children) {
    child.push(output);
  }
};

import Streamie from "@root/Streamie";

// Types
import { P } from "@root/utils/namespace";
import { Handler, Item, StreamiePrivateNamespace } from "@root/Streamie/types";
import { FilterConfig } from "./types";

// Private Methods.
import _addChildren from "../../private/_addChildren";

// Constants.
import { STREAMIE_SHOULD_OMIT } from "@root/Streamie/constants";

/**
 * Returns a streamie which will only output results which pass the provided
 * predicate, which defaults to truthiness.
 * @param p - The private namespace getter
 * @param self - The Streamie instance
 * @param handler - The handler to execute for a given QueueItem
 * @param config - The configuration options
 * @returns The new child streamie.
 */
export default (
  p: P<Streamie, StreamiePrivateNamespace>,
  self: Streamie,
  handler: Handler,
  {
    predicate = (test: any):boolean => !!test,
    ...streamieConfig
  }: FilterConfig
): Streamie => {
  const child = new Streamie(async (item: Item, ...args) => {
    const result = await Promise.resolve(handler(item, ...args));
    return predicate(result) !== false ? item : STREAMIE_SHOULD_OMIT;
  }, streamieConfig);

  _addChildren(p, self, child);

  return child;
};

// Types
import { HandlerUtilities, StreamieState, StreamieHandler } from '@root/Streamie/types';
import { Streamie } from '../../types';
import { FilterConfig } from './types';

// Utils
import createStreamie from '@root/Streamie';

// // Private Methods.
// import _addChildren from '../../private/_addChildren';

// Constants.
import { STREAMIE_SHOULD_OMIT } from '@root/Streamie/constants';


/**
 * Returns a streamie which will only output results which pass the provided
 * predicate, which defaults to truthiness.
 * @param state - The Streamie state
 * @param handler - The handler to execute for a given QueueItem
 * @param config - The configuration options
 * @returns The new child streamie.
 */
export default <InputItem, OutputItem>(
  state: StreamieState<InputItem, OutputItem>,
  handler: StreamieHandler<InputItem, OutputItem>,
  {
    predicate = (test: any): boolean => !!test,
    ...streamieConfig
  }: FilterConfig
): Streamie<InputItem, OutputItem> => {
  return createStreamie<InputItem, OutputItem>(handler, {});
  // const child = createStramie(async (item: InputItem, utils: HandlerUtilities) => {
  //   const result = await Promise.resolve(handler(item, utils));
  //   return predicate(result) !== false ? item : STREAMIE_SHOULD_OMIT;
  // }, streamieConfig);

  // // _addChildren(p, self, child);

  // return child;
};

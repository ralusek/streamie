// Types
import {Handler, StreamieConfig} from './Streamie/types';

import Streamie from './Streamie';

/**
 * Creates a streamie source.
 * @param handler - The handler function to be invoked over each item passed into the streamie
 * @param config - The Streamie configuration settings.
 */
export const source = (handler: Handler, config: StreamieConfig): Streamie => {
  return new Streamie(handler, config);
};

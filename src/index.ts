// Types
import {Handler, StreamieConfig} from './Streamie/types';

import Streamie from './Streamie';

export const source = (handler: Handler, config: StreamieConfig): Streamie => {
  return new Streamie(handler, config);
}

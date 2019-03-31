// Types
import { StreamieId } from '@root/utils/generateId';

/**
 * Configuration object for public .push method.
 */
export type StreamiePushConfig = {
  /** The input id. Follows an input through its lifetime through the streamie. */
  id?: StreamieId,
};

// Types
import { QueueItem } from "@root/QueueItem";
import Streamie from "@root/Streamie";
import { StreamieConfig } from "@root/Streamie/types";

/**
 * The private namespace for instances of StreamieState.
 */
export type StreamieStatePrivateNamespace = {
  config: StreamieConfig,
};

/**
 * The state in a publicly digestible format.
 */
export type StreamieStatePublic = {
  count: {
    queued: number,
    handling: number,
  },
  isAtConcurrentCapacity: boolean,
  isBlocked: boolean,
}

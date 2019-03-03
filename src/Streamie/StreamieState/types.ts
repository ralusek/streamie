// Types
import { QueueItem } from "@root/QueueItem";
import Streamie from "@root/Streamie";

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

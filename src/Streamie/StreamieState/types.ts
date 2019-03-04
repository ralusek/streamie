// Types
import { StreamieConfig } from "@root/Streamie/types";

/**
 * The private namespace for instances of StreamieState.
 */
export type StreamieStatePrivateNamespace = {
  config: StreamieConfig,
  /** Whether or not the stream is paused. */
  isPaused: boolean,
  /** Whether or not the stream is completed. */
  isCompleted: boolean,
  /** Whether or not the stream is stopped. */
  isStopped: boolean
};

/**
 * The state in a publicly digestible format.
 */
export type StreamieStatePublic = {
  count: {
    /** The number of items currently queued, including those being handled. */
    queued: number,
    /** The number of items currently being handled. */
    handling: number,
  },
  maxConcurrency: number,
  isAtConcurrentCapacity: boolean,
  isBlocked: boolean,
  isPaused: boolean
}

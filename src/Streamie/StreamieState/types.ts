// Types
import { StreamieConfig } from "@root/Streamie/types";
import Emittie from "@root/utils/Emittie";

/**
 * The private namespace for instances of StreamieState.
 */
export type StreamieStatePrivateNamespace = {
  config: StreamieConfig,
  /** The event emitter. */
  emittie: Emittie,
  /** Whether or not the stream is paused. */
  isPaused: boolean,
  /** Whether or not the stream is stopped. */
  isStopped: boolean,
  /** Whether or not the stream is handling its final items */
  isCompleting: boolean,
  /** Whether or not the stream is completed. */
  isCompleted: boolean,
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
  maxBacklogLength: number,
  isAtConcurrentCapacity: boolean,
  isAtBacklogCapacity: boolean,
  isPaused: boolean,
  canHandle: boolean,
  canPushToChildren: boolean
}

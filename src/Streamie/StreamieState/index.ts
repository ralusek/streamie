// Types
import Streamie from "@root/Streamie";
import { StreamieConfig } from "@root/Streamie/types";
import { StreamieStatePublic, StreamieStatePrivateNamespace } from "./types";
import { StreamieQueue } from "../StreamieQueue";

// Utils
import namespace, { P } from '@root/utils/namespace';

// Private Methods
import _isChildBlocking from "./methods/private/_isChildBlocking";
import { StreamieQueueItem } from "../StreamieQueue/types";


// Method for private namespacing.
const p: P<StreamieState, StreamieStatePrivateNamespace> = namespace();


/**
 * The state, related logic, and getters, for an associated Streamie.
 */
export default class StreamieState {
  /**
   * Whether or not the stream is paused.
   */
  public paused: boolean;

  /**
   * The QueueItems which have yet to be handled or are currently handling.
   */
  public queue: StreamieQueue;

  /**
   * The QueueItems being handled.
   */
  public handling: Set<StreamieQueueItem>;

  /**
   * The downstream child Streamies.
   */
  public children: Set<Streamie>;

  constructor(config: StreamieConfig) {
    p(this).config = config;

    this.paused = false;

    this.queue = new StreamieQueue(); // The items which have yet to be handled or are currently handling
    this.handling = new Set(); // The StreamieQueueItems being handled
    this.children = new Set(); // The downstream child Streamies
  }

  /**
   * Retrieve StreamieState in a publicly digestible format.
   * @returns The public state
   */
  get readable(): StreamieStatePublic {
    const state: StreamieStatePublic | any = {
      count: {
        queued: this.queue.length,
        handling: this.handling.size,
      },
      maxConcurrency: p(this).config.concurrency,
      isPaused: this.paused,
    };

    state.isAtConcurrentCapacity = state.count.handling === state.maxConcurrency;

    state.isBlocked = state.isAtConcurrentCapacity || _isChildBlocking(this.children);

    return state;
  }
}

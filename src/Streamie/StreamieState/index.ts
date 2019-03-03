// Types
import Streamie from "@root/Streamie";
import { StreamieConfig } from "@root/Streamie/types";
import { QueueItem } from "@root/QueueItem";
import { StreamieStatePublic, StreamieStatePrivateNamespace } from "./types";

// Utils
import namespace, { P } from '@root/utils/namespace';

// Private Methods
import _isChildBlocking from "./methods/private/_isChildBlocking";

// Method for private namespacing.
const p: P<StreamieState, StreamieStatePrivateNamespace> = namespace();


/**
 * The state, related logic, and getters, for an associated Streamie.
 */
export default class StreamieState {
  /**
   * The QueueItems which have yet to be handled or are currently handling.
   */
  public queue: QueueItem[];

  /**
   * The QueueItems being handled.
   */
  public handling: Set<QueueItem>;

  /**
   * The downstream child Streamies.
   */
  public children: Set<Streamie>;

  constructor(config: StreamieConfig) {
    p(this).config = config;

    this.queue = []; // The QueueItems which have yet to be handled or are currently handling
    this.handling = new Set(); // The QueueItems being handled
    this.children = new Set(); // The downstream child Streamies
  }

  /**
   * Retrieve StreamieState in a publicly digestible format.
   * @returns The public state
   */
  get asPublic(): StreamieStatePublic {
    const state: any = {
      count: {
        queued: this.queue.length,
        handling: this.handling.size
      }
    };

    state.isAtConcurrentCapacity = this.handling.size === p(this).config.concurrency;

    state.isBlocked = state.isAtConcurrentCapacity || _isChildBlocking(this.children);

    return state;
  }
}
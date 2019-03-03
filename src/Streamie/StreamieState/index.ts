// Types
import { QueueItem } from "@root/QueueItem";
import Streamie from "..";
import { StreamieStatePublic } from "./types";

// Private Methods
import _isChildBlocking from "./methods/private/_isChildBlocking";


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

  constructor() {
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

    // TODO change this to reference configured concurrency max
    state.isAtConcurrentCapacity = !!this.handling.size;

    state.isBlocked = state.isAtConcurrentCapacity || _isChildBlocking(this.children);

    return state;
  }
}

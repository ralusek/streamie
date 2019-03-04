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
 /** The QueueItems which have yet to be handled or are currently handling. */
  public queue: StreamieQueue;

  /** The QueueItems being handled. */
  public handling: Set<StreamieQueueItem>;

  /** The downstream child Streamies.*/
  public children: Set<Streamie>;

  constructor(config: StreamieConfig) {
    p(this).config = config;

    p(this).isPaused = false;
    p(this).isStopped = false;
    p(this).isCompleted = false;

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
      isPaused: p(this).isPaused,
      isStopped: p(this).isStopped,
      isCompleted: p(this).isCompleted
    };

    state.isAtConcurrentCapacity = state.count.handling === state.maxConcurrency;

    state.isBlocked = state.isPaused ||
                      state.isStopped ||
                      state.isCompleted ||
                      state.isAtConcurrentCapacity ||
                      _isChildBlocking(this.children);

    return state;
  }

  /**
   * Toggles the isPaused value of the streamie if no value is provided, else sets it to
   * the provided value.
   * @param value - The optional value to set the pause. Toggles value if undefined.
   * @returns - The value that isPaused was set to.
   */
  pause(value?: boolean): boolean {
    return p(this).isPaused = value !== undefined ? !!value : !p(this).isPaused;
  }

  /**
   * Sets isStopped to true.
   */
  stop(): void {
    p(this).isStopped = true;
  }

  /**
   * Sets isCompleted to true.
   */
  complete(): void {
    p(this).isCompleted = true;
  }
}

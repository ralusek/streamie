// Types
import Streamie from "@root/Streamie";
import Emittie from "@root/Emittie";
import { StreamieConfig } from "@root/Streamie/types";
import { StreamieStatePublic, StreamieStatePrivateNamespace } from "./types";
import { StreamieQueue } from "../StreamieQueue";
import { StreamieQueueItem } from "../StreamieQueue/types";

// Utils
import namespace, { P } from '@root/utils/namespace';

// Public Methods
import getReadableState from "./methods/public/getReadableState";

// Event Names
import { COMPLETING, COMPLETED, PAUSED, RESUMED } from "./events/constants";
import { EventName, EventCallbackWithEventName } from "@root/Emittie/types";
import { observable, computed } from "@root/utils/observable";

const x: any = {};


observable(x, 'value1', 5);
observable(x, 'value2', 10);
computed(x, 'sum', () => {
  console.log('Is recomputed');
  return x.value1 + x.value2;
});

x.value1 = 100;
console.log(x.sum);
x.sum;
x.sum;
x.value1 = 100;
x.value2 = 150;
console.log(x.sum);


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
    p(this).emittie = new Emittie();
    p(this).config = config;

    p(this).isPaused = false;
    p(this).isStopped = false;
    p(this).isCompleting = false;
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
    return getReadableState(p, this);
  }

  /**
   * Register an event listener for events.
   * @param callback - The callback to invoke on event emitted
   */
  onAny(callback: EventCallbackWithEventName) {
    return p(this).emittie.onAny(callback);
  }

  /**
   * Toggles the isPaused value of the streamie if no value is provided, else sets it to
   * the provided value.
   * @param value - The optional value to set the pause. Toggles value if undefined.
   * @returns - The value that isPaused was set to.
   */
  pause(value?: boolean): boolean {
    const oldValue = p(this).isPaused;
    const newValue = p(this).isPaused = value !== undefined ? !!value : !p(this).isPaused;

    if (oldValue !== newValue) newValue ? p(this).emittie.emit(PAUSED) : p(this).emittie.emit(RESUMED);

    return newValue;
  }

  /**
   * Sets isStopped to true.
   * @throws Error if already stopped.
   * @throws Error if already completed.
   */
  stop(): void {
    if (p(this).isStopped) throw new Error(`Streamie cannot be stopped, has already been stopped.`);
    if (p(this).isCompleted) throw new Error(`Streamie cannot be stopped, has already completed.`);
    p(this).isStopped = true;
  }

  /**
   * Begins completing process.
   * @throws Error if already is completing.
   * @throws Error if has already been stopped.
   */
  beginComplete(): void {
    if (p(this).isCompleting) throw new Error(`Streamie cannot begin completing, is already completing.`);
    if (p(this).isStopped) throw new Error(`Streamie cannot begin completing, has already been stopped.`);

    p(this).isCompleting = true;
    p(this).emittie.emit(COMPLETING);
  }

  /**
   * Sets isCompleted to true.
   * @throws - Error if is not yet completing.
   */
  complete(): void {
    if (!p(this).isCompleting) throw new Error(`Streamie cannot be completed, is not yet completing.`);
    p(this).isCompleted = true;
    p(this).emittie.emit(COMPLETED);
  }
}

// Types
import { EventName } from "@root/Emittie/types";

export const PAUSED: EventName = Symbol.for('Streamie State Event: Streamie State Paused');
export const RESUMED: EventName = Symbol.for('Streamie State Event: Streamie State Resumed');
export const STOPPED: EventName = Symbol.for('Streamie State Event: Streamie State Stopped');
export const COMPLETING: EventName = Symbol.for('Streamie State Event: Streamie State Completing');
export const COMPLETED: EventName = Symbol.for('Streamie State Event: Streamie State Completed');

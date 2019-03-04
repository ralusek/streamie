// Types
import { EventName } from "@root/Emittie/types";

export const PAUSED: EventName = Symbol.for('STREAMIE EVENT: PAUSED');
export const ITEM_PUSHED: EventName = Symbol.for('STREAMIE EVENT: ITEM PUSHED');
export const CONCURRENT_CAPACITY_REACHED: EventName = Symbol.for('STREAMIE EVENT: CONCURRENT CAPACITY REACHED');
export const CONCURRENT_CAPACITY_RELIEVED: EventName = Symbol.for('STREAMIE EVENT: CONCURRENT CAPACITY RELIEVED');

export const CHILD_CONCURRENT_CAPACITY_REACHED: EventName = Symbol.for('STREAMIE EVENT: CHILD CONCURRENNT CAPACITY REACHED');

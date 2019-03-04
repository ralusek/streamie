// Types
import { EventName } from "@root/Emittie/types";

export const PAUSED: EventName = Symbol.for('Streamie Event: Streamie Paused');
export const ITEM_PUSHED: EventName = Symbol.for('Streamie Event: Item Pushed');
export const ITEM_HANDLED: EventName = Symbol.for('Streamie Event: Item Handled');

export const CHILD_PAUSED: EventName = Symbol.for('Streamie Event: Child Paused');
export const CHILD_ITEM_PUSHED: EventName = Symbol.for('Streamie Event: Child Item Pushed');
export const CHILD_ITEM_HANDLED: EventName = Symbol.for('Streamie Event: Child Item Handled');

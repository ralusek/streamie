// Types
import { EventName } from "@root/Emittie/types";

export const PAUSED: EventName = Symbol.for('Streamie Event: Streamie Paused');
export const RESUMED: EventName = Symbol.for('Streamie Event: Streamie Resumed');
export const ITEM_PUSHED: EventName = Symbol.for('Streamie Event: Item Pushed');
export const ITEM_HANDLED: EventName = Symbol.for('Streamie Event: Item Handled');

/**
 * The private namespace for instances of Emittie.
 */
export type EmittiePrivateNamespace = {
  callbacks: EmittieCallbackSets
};

export type EmittieCallbackSets = {
  /** The event callbacks associated with a specific event name. */
  on: Map<EventName, EventCallback[]>,
  /** The event callbacks that will trigger on any event. */
  onAny: EventCallbackWithEventName[]
};

/**
 * Event name, for which it callbacks are registered and events are emitted.
 */
export type EventName = string | Symbol;

/**
 * A callback registered for a given EventName, and invoked on emit with EventPayloads.
 */
export type EventCallback = (...payloads: EventPayload[]) => void;

/**
 * A callback registered and invoked on emit with the EventName, and EventPayloads.
 */
export type EventCallbackWithEventName = (eventName: EventName, ...payloads: EventPayload[]) => void;

/**
 * The value with which an event will be emitted.
 */
export type EventPayload = any;

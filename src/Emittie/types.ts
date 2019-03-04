/**
 * The private namespace for instances of Emittie.
 */
export type EmittiePrivateNamespace = {
  callbacks: EmittieCallbackSets
};

export type EmittieCallbackSets = {
  on: Map<EventName, EventCallback[]>
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
 * The value with which an event will be emitted.
 */
export type EventPayload = any;

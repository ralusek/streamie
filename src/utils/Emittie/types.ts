export type EmittieState<EventNameType extends string | symbol> = {
  private: EmittiePrivateState<EventNameType>,
  public: Emittie<EventNameType>,
};

/**
 * Emittie public state.
 */
export type Emittie<EventNameType extends string | symbol> = {
  /**
   * Associates a callback with a given event name.
   * @param name - The EventName to register the callback for
   * @param callback - The EventCallback to associate with the EventName
   */
  on: (name: EventNameType, callback: EventCallback) => void,
  /**
   * Associates a callback with all events.
   * @param callback - The EventCallbackWithEventName to associate with the EventName
   */
  onAny: (callback: EventCallbackWithEventName<EventNameType>) => void,
  /**
   * Emits an event by invoking the callbacks associated with the EventName with
   * the provided EventPayload(s).
   * @param name - The EventName whose associated callbacks should be invoked with the payload(s)
   * @param payloads - The EventPayload(s) with which to invoke the associated callbacks
   */
  emit: <T = any>(name: EventNameType, ...payloads: EventPayload<T>[]) => void,
};

/**
 * The private namespace for instances of Emittie
 */
export type EmittiePrivateState<EventNameType extends string | symbol> = {
  callbacks: EmittieCallbackSets<EventNameType>
};

/**
 *
 */
export type EmittieCallbackSets<EventNameType extends string | symbol> = {
  /** The event callbacks associated with a specific event name. */
  on: Partial<{[key in EventNameType]: EventCallback[]}>,
  /** The event callbacks that will trigger on any event. */
  onAny: EventCallbackWithEventName<EventNameType>[]
};

/**
 * A callback registered for a given EventName, and invoked on emit with EventPayloads.
 */
export type EventCallback = (...payloads: EventPayload[]) => void;

/**
 * A callback registered and invoked on emit with the EventName, and EventPayloads.
 */
export type EventCallbackWithEventName<EventNameType> = (eventName: EventNameType, ...payloads: EventPayload[]) => void;

/**
 * The value with which an event will be emitted.
 */
export type EventPayload<T = any> = T;

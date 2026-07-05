// Strongly typed event primitives.
//
// createEventHandlers takes a spec — each key an event name, each value an event()
// marker carrying that event's payload type and behavior — and returns a matching
// record of emitters. The payload types are inferred from the spec, so names and
// types are never declared twice:
//
//   const events = createEventHandlers({
//     progress: event<number>(),
//     done: event({ latching: true }),
//   });
//
//   const unsubscribe = events.progress.on((value) => { ... });
//   events.progress.on.once((value) => { ... });
//   events.progress.emit(0.5);
//
// The subscription side (events.x.on) is the part safe to hand out publicly; emit
// stays with the owner.
//
// Subscription identity follows EventEmitter, not DOM EventTarget: subscribing the
// same function twice registers two independent subscriptions — it fires twice per
// emit, and each on() call's returned unsubscribe removes only its own registration.

export type Unsubscribe = () => void;

// The subscription side of an event: callable to register a persistent handler, with
// .once for handlers that remove themselves after one invocation. Both return an
// unsubscribe function (a no-op when the handler was invoked immediately because a
// latching event had already fired).
export type Subscribe<Payload = void> = {
  (handler: (payload: Payload) => void): Unsubscribe;
  once: (handler: (payload: Payload) => void) => Unsubscribe;
};

export type EventEmitter<Payload = void> = {
  on: Subscribe<Payload>;
  emit: (payload: Payload) => void;
};

type EventOptions = {
  // A latching event fires at most once. Its payload is retained, and handlers
  // subscribed after the firing are invoked immediately with it — like a promise,
  // late subscribers don't miss the transition. Subsequent emits are ignored.
  // Suited to one-way state transitions (draining, drained, halted).
  latching?: boolean;
};

// Phantom property that carries the payload type through createEventHandlers'
// inference. It never exists at runtime (hence the cast in event()); it is declared
// required rather than optional so that inference recovers the exact payload type —
// an optional property would infer `Payload | undefined`, which for void payloads
// would break emit's zero-argument call signature.
declare const payloadType: unique symbol;
export type EventSpec<Payload = void> = EventOptions & {
  readonly [payloadType]: Payload;
};

export function event<Payload = void>(options: EventOptions = {}): EventSpec<Payload> {
  return options as EventSpec<Payload>;
}

const UNLATCHED = Symbol('unlatched');
const noop = () => {};

// Invokes a subscriber with its exceptions isolated from dispatch. These events drive
// streamie-to-streamie wiring (a stage's drain/halt cascade is itself a subscriber to
// its neighbors' lifecycle events), so a throwing user handler must not prevent the
// handlers queued behind it from running — that would sever a pipeline mid-cascade and
// hang downstream promises — nor skip a latching event's bookkeeping. The error is not
// swallowed: it is rethrown from a fresh microtask, so it still surfaces as an uncaught
// exception, just without taking event delivery down with it.
function invokeHandler<Payload>(handler: (payload: Payload) => void, payload: Payload): void {
  try {
    handler(payload);
  } catch (err) {
    queueMicrotask(() => { throw err; });
  }
}

function createEvent<Payload>({ latching = false }: EventOptions): EventEmitter<Payload> {
  const handlers = new Set<(payload: Payload) => void>();
  let latched: Payload | typeof UNLATCHED = UNLATCHED;

  const on = ((handler: (payload: Payload) => void): Unsubscribe => {
    if (latched !== UNLATCHED) {
      // Same isolation as a dispatched firing: a late subscriber's throw should
      // surface identically whether it attached before or after the transition.
      invokeHandler(handler, latched as Payload);
      return noop;
    }
    // Each subscription gets its own wrapper (as .once already does) so that the
    // handler Set holds a unique member per on() call: EventEmitter semantics.
    // Adding the handler itself would make the Set silently dedupe a function
    // subscribed twice — one invocation per emit instead of two, and worse, the two
    // returned unsubscribes would alias (either one tears down "both" subscriptions).
    // The wrapper costs one closure at subscription time (pipeline wiring, not the
    // per-item path) and one call frame per dispatch.
    const entry = (payload: Payload) => handler(payload);
    handlers.add(entry);
    return () => { handlers.delete(entry); };
  }) as Subscribe<Payload>;

  on.once = (handler: (payload: Payload) => void): Unsubscribe => {
    if (latched !== UNLATCHED) {
      invokeHandler(handler, latched as Payload);
      return noop;
    }
    const wrapped = (payload: Payload) => {
      handlers.delete(wrapped);
      handler(payload);
    };
    handlers.add(wrapped);
    return () => { handlers.delete(wrapped); };
  };

  const emit = (payload: Payload) => {
    if (latching) {
      if (latched !== UNLATCHED) return;
      latched = payload;
    }
    if (handlers.size > 0) {
      // Dispatch over a snapshot, skipping handlers that have been unsubscribed by
      // an earlier handler in the same firing: a firing invokes exactly the handlers
      // subscribed when it began and still subscribed when their turn comes. In
      // particular, a handler subscribed during a firing (e.g. a .once handler
      // re-arming itself) waits for the next emit rather than being invoked by the
      // one in flight. (For a latching event there is no next emit; subscribing
      // mid-firing lands on the already-set latch and is invoked immediately, which
      // is that mode's contract.)
      // Each handler is invoked exception-isolated (see invokeHandler): a thrower
      // cannot starve the handlers behind it, and the latching clear below always runs.
      const snapshot = Array.from(handlers);
      for (let i = 0; i < snapshot.length; i++) {
        if (handlers.has(snapshot[i])) invokeHandler(snapshot[i], payload);
      }
    }
    // Once latched, immediate invocation takes over delivery; the retained handlers
    // would never fire again, so release them.
    if (latching) handlers.clear();
  };

  return { on, emit };
}

type PayloadOf<Spec> = Spec extends EventSpec<infer Payload> ? Payload : never;

// The constraint is EventOptions rather than Record<string, EventSpec<any>> on
// purpose: a constraint mentioning EventSpec<any> would contextually type the
// event() calls in the spec literal, overriding their void payload default with any.
export default function createEventHandlers<Spec extends Record<string, EventOptions>>(
  spec: Spec,
): { [K in keyof Spec]: EventEmitter<PayloadOf<Spec[K]>> } {
  const emitters: Record<string, EventEmitter<unknown>> = {};
  for (const name of Object.keys(spec)) emitters[name] = createEvent(spec[name]);
  return emitters as { [K in keyof Spec]: EventEmitter<PayloadOf<Spec[K]>> };
}

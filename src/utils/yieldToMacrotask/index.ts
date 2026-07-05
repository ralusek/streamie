// Schedules a callback onto the macrotask queue as immediately as the environment
// allows. The point of a macrotask (rather than queueMicrotask) is that it lets the
// event loop turn over — timers, I/O, rendering — before the callback runs:
//   - setImmediate (Node, Bun): the canonical no-delay macrotask.
//   - setTimeout(0) (Deno): see the Deno note below.
//   - MessageChannel (browsers): a message-port round trip, because setTimeout(0) is
//     clamped to >= 1ms (and >= 4ms once nested), which would tax every yield.
//   - setTimeout(0): the universal fallback.
type Scheduler = (callback: () => void) => void;

// Minimal structural shape of MessageChannel, declared locally because the project
// compiles without lib.dom. port unref() is optional: present on Node-like hosts,
// absent in browsers (which have no event loop to keep alive).
type MessageChannelLike = new () => {
  port1: { onmessage: ((event: unknown) => void) | null; unref?: () => void };
  port2: { postMessage: (value: unknown) => void; unref?: () => void };
};

const yieldToMacrotask: Scheduler = (() => {
  if (typeof setImmediate === 'function') {
    return (callback: () => void) => { setImmediate(callback); };
  }
  // Deno exposes MessageChannel but no setImmediate, and its MessagePorts cannot be
  // unref'd, so the persistent channel below would hold the event loop open forever —
  // even a bare `import` of this library would never let the process exit. Deno imposes
  // none of the browser's timer clamping, so setTimeout(0) is an immediate,
  // exit-friendly macrotask here. (Checked before MessageChannel for exactly that
  // reason; Bun never reaches this branch, having setImmediate above.)
  if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') {
    return (callback: () => void) => { setTimeout(callback, 0); };
  }
  // Through unknown: @types/node declares a global MessageChannel (the
  // worker_threads one) whose port shape differs; at runtime this branch is only
  // reached where setImmediate is absent and no Deno global is present, i.e. browsers.
  const MessageChannelImpl = (globalThis as unknown as { MessageChannel?: MessageChannelLike }).MessageChannel;
  if (typeof MessageChannelImpl === 'function') {
    // One persistent channel; messages are delivered in post order, so a FIFO pairs
    // each delivery with its callback. Browsers have no process to exit, so the
    // persistent channel is fine there; unref() (a no-op in browsers) keeps any
    // Node-like host that somehow lands here from being held open by it.
    const callbacks: (() => void)[] = [];
    const channel = new MessageChannelImpl();
    channel.port1.unref?.();
    channel.port2.unref?.();
    channel.port1.onmessage = () => { callbacks.shift()!(); };
    return (callback: () => void) => {
      callbacks.push(callback);
      channel.port2.postMessage(null);
    };
  }
  return (callback: () => void) => { setTimeout(callback, 0); };
})();

export default yieldToMacrotask;

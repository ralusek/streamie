// Schedules a callback onto the macrotask queue as immediately as the environment
// allows. The point of a macrotask (rather than queueMicrotask) is that it lets the
// event loop turn over — timers, I/O, rendering — before the callback runs:
//   - setImmediate (Node): the canonical no-delay macrotask.
//   - MessageChannel (browsers): a message-port round trip, because setTimeout(0) is
//     clamped to >= 1ms (and >= 4ms once nested), which would tax every yield.
//   - setTimeout(0): the universal fallback.
type Scheduler = (callback: () => void) => void;

// Minimal structural shape of MessageChannel, declared locally because the project
// compiles without lib.dom.
type MessageChannelLike = new () => {
  port1: { onmessage: ((event: unknown) => void) | null };
  port2: { postMessage: (value: unknown) => void };
};

const yieldToMacrotask: Scheduler = (() => {
  if (typeof setImmediate === 'function') {
    return (callback: () => void) => { setImmediate(callback); };
  }
  // Through unknown: @types/node declares a global MessageChannel (the
  // worker_threads one) whose port shape differs; at runtime this branch is only
  // reached where setImmediate is absent, i.e. browsers.
  const MessageChannelImpl = (globalThis as unknown as { MessageChannel?: MessageChannelLike }).MessageChannel;
  if (typeof MessageChannelImpl === 'function') {
    // One persistent channel; messages are delivered in post order, so a FIFO pairs
    // each delivery with its callback.
    const callbacks: (() => void)[] = [];
    const channel = new MessageChannelImpl();
    channel.port1.onmessage = () => { callbacks.shift()!(); };
    return (callback: () => void) => {
      callbacks.push(callback);
      channel.port2.postMessage(null);
    };
  }
  return (callback: () => void) => { setTimeout(callback, 0); };
})();

export default yieldToMacrotask;

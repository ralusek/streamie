// Types
import type { Streamie } from '../../../types';

// Exposes a streamie's outputs *as* a WHATWG ReadableStream — the outbound source
// bridge, the mirror image of pumpReadableStream (which feeds a stream *into* a
// streamie). Together with fromReadableStream this closes the loop: a streamie can be
// both fed by and read as a web stream, and any consumer that speaks ReadableStream
// (pipeTo/pipeThrough, a Response body, ...) can drive a pipeline.
//
// It is built on the streamie's own async iterator rather than a hand-rolled consumer,
// so it inherits every consumer rule already proven there — backlog delivery, output
// broadcast to concurrent consumers, drain-as-done, halt-as-rejection — for free.
//
// The stream is pull-driven: the platform calls pull() whenever it wants another
// chunk and not before, which is exactly WHATWG read backpressure. Each pull advances
// the iterator one step, and the iterator in turn paces the streamie (one item per
// pull cycle, the streamie's bounded output queue absorbing the rest). So demand flows
// end to end: a slow downstream reader slows pull, which slows the iterator, which
// builds backpressure up the pipeline. Termination maps in both directions:
//   - streamie drains            -> controller.close()       (clean end of stream)
//   - streamie aborts/halts      -> controller.error(error)  (the iteration rejects
//                                   with the terminating error; surfaced to readers,
//                                   the inverse of a stream error becoming target.abort)
//   - stream consumer cancels    -> iterator.return()        (a voluntary detach)
//
// This lives apart from fromReadableStream (in the web entry) for the same reason
// pumpReadableStream does: it needs only an existing streamie, so keeping it here
// avoids an import cycle with the factory.
export default function toReadableStream<O>(
  streamie: Streamie<any, O, any>,
  strategy?: QueuingStrategy<O>,
): ReadableStream<O> {
  // The constructor is a web-platform global (browser, Node >= 18, Deno, Bun); the
  // streamie/web entry's type environment provides its type, but at runtime it is still
  // absent below the WHATWG floor (Node < 18), so guard for a clear error rather than a
  // bare "ReadableStream is not a constructor".
  if (typeof ReadableStream === 'undefined') {
    throw new Error(
      'toReadableStream requires a global ReadableStream constructor (browser, Node >= 18, Deno, or Bun).',
    );
  }

  const iterator = streamie[Symbol.asyncIterator]();
  // A cancel can land while a pull's iterator.next() is in flight; the controller is
  // closed by then, and enqueue/close would throw. The flag lets the resolving pull
  // bow out instead.
  let isStopped = false;
  async function stopIterator(): Promise<void> {
    if (isStopped) return;
    isStopped = true;
    await iterator.return?.();
  }

  return new ReadableStream<O>(
    {
      // Returning the promise serializes pulls: the platform awaits it before asking
      // for the next chunk, so at most one iterator.next() is ever outstanding.
      async pull(controller) {
        let result: IteratorResult<O>;
        try {
          result = await iterator.next();
        } catch (error) {
          // The streamie aborted or halted with a propagated error: the iteration
          // rejects with the terminating error (its abort/onHalted contract). Surface
          // it to the stream's consumers — the inverse of pumpReadableStream mapping a
          // stream error onto target.abort.
          if (!isStopped) {
            try {
              controller.error(error);
            } finally {
              await stopIterator();
            }
          }
          return;
        }
        if (isStopped) return;
        if (result.done) {
          try {
            controller.close();
          } finally {
            await stopIterator();
          }
          return;
        }
        try {
          controller.enqueue(result.value);
        } catch (error) {
          await stopIterator();
          throw error;
        }
      },
      // The consumer no longer wants the stream — the ReadableStream equivalent of
      // breaking out of a for-await, and treated as exactly that: iterator.return()
      // unhooks this consumer from the streamie (a voluntary detach), and the core's
      // own rules decide the rest. A surviving sibling consumer is unaffected, and a
      // now-consumer-less streamie parks on its retained outputs rather than aborting,
      // just as an iterator break does. The cancel reason is deliberately not turned
      // into a streamie abort: a polite downstream cancel must not tear down the whole
      // upstream pipeline (nor any sibling consumer), and this matches WHATWG's own
      // ReadableStream-from-async-iterable behavior, which calls return(), not throw().
      cancel() {
        return stopIterator();
      },
    },
    strategy,
  );
}

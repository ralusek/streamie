// The WHATWG (web) stream bridges — the ReadableStream/WritableStream counterparts of
// the node:stream bridges in 'streamie/node'. They live behind this separate entry
// ('streamie/web') so the core entry stays free of any stream type dependency: a
// consumer with a bare ES lib can use the core without a DOM or Node type environment
// in scope. Importing this module opts into one — it types its streams against the
// real WHATWG globals (ReadableStream<T>, WritableStream<T>, QueuingStrategy<T>), which
// browsers, Deno, and Bun provide via lib.dom and Node provides via @types/node (recent
// enough) or the dom lib. (At runtime these globals exist on every WHATWG-stream
// runtime — Node >= 18 included — so this entry stays as portable as the core; the
// requirement is purely on the type environment, the same opt-in 'streamie/node' makes
// for node:stream.)
//
// Using the real types — rather than the structural aliases this once carried to dodge
// lib.dom in the core — is the payoff of the split: chunk types flow by plain inference
// (fromReadableStream(response.body!) yields a Streamie<Uint8Array, ...>), and the
// produced stream is a genuine ReadableStream<O>, so DOM consumers (new Response(body),
// pipeThrough) accept it directly.

// Types
import type { Streamie, Config } from './types.js';

// The streamie factory and the bridge implementations. Importing the factory from the
// core entry is safe here because the dependency runs one way: the core never imports
// this module, so there is no cycle. The pump lives in its own module
// (utils/streams/readable) rather than inline here so it can be exercised against any
// existing streamie, and so it stays free of an import cycle with this factory-importing
// entry.
import streamie from './index.js';
import pumpReadableStream from './utils/streams/readable/index.js';

// Creates a streamie fed by a WHATWG ReadableStream. Items flow under backpressure (the
// stream is only pulled as fast as the pipeline absorbs items, bounded by
// backpressureAt); the stream ending drains the streamie, the stream erroring aborts it
// with that error, and the streamie terminating cancels the stream's reader. Because
// downstream failure cascades upstream through the core (a consumer halt that leaves a
// streamie consumer-less aborts it, transitively), a failure at *any* depth in the
// pipeline reaches the bridge and cancels the reader with the root error — the
// source-cancellation contract of pipeTo across a pipeThrough chain. preventCancel: true
// (pipeTo's option) keeps the stream itself out of it: the bridge streamie still halts,
// but the reader lock is released without cancelling, leaving the stream readable by
// another consumer.
//
// The chunk type T is inferred straight from ReadableStream<T>; the output is its
// Awaited because handler results are awaited (a stream of thenables emits their settled
// values — for any ordinary chunk type both are just the chunk type).
export function fromReadableStream<T>(
  stream: ReadableStream<T>,
  config: Pick<Config, 'backpressureAt' | 'yieldAfter'> & { preventCancel?: boolean } = {},
): Streamie<T, Awaited<T>> {
  const bridged = streamie((input: T) => input, config);
  pumpReadableStream(stream, bridged, { preventCancel: config.preventCancel });
  return bridged;
}

// Pipes a streamie's outputs into a WHATWG WritableStream, resolving once the streamie
// has drained and the sink has closed (pipeTo's contract). A streamie abort/halt aborts
// the sink, a sink failure aborts the streamie, and either rejects the returned promise.
export { default as toWritableStream } from './utils/streams/writable/index.js';

// The mirror of fromReadableStream: exposes a streamie's outputs as a WHATWG
// ReadableStream, pull-driven so the consumer's reads pace the pipeline. The streamie
// draining closes the stream; an abort or halt errors it with the terminating error;
// and the consumer cancelling the stream detaches it from the streamie as a voluntary
// departure (no upstream cascade), the same as breaking a for-await. An optional queuing
// strategy tunes the produced stream's read-ahead (default high water mark 1).
export { default as toReadableStream } from './utils/streams/readable/toReadableStream.js';

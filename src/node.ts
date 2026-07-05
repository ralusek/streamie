// The Node stream bridges — the node:stream (Readable/Writable) counterparts of the
// WHATWG bridges in the main entry. They live behind this separate entry point
// (imported as `streamie/node`) for one reason: node:stream is a Node-only dependency,
// and the package is deliberately environment-agnostic — the main entry runs unchanged
// in browsers, Deno, and Bun, speaking only WHATWG streams (web-platform globals, no
// imports). Pulling node:stream is opt-in, paid for only by code that imports this
// module; nothing here is reachable from the main entry, so a browser bundle never
// sees it.
//
// Unlike the WHATWG bridges, these type their streams against @types/node directly
// rather than local structural aliases: this entry is Node by definition, so the type
// environment the main entry can't presume is simply present, and the structural dance
// would be noise. The three bridges mirror their WHATWG siblings one-to-one —
// fromReadable/toReadable/toWritable to fromReadableStream/toReadableStream/
// toWritableStream — see each implementation for the termination and backpressure
// contracts, which match.

// Types
import type { Readable } from 'node:stream';
import type { Streamie, Config } from './types.js';

// The streamie factory and the bridge implementations. Importing the factory from the
// main entry is safe here precisely because the dependency runs one way: the main entry
// never imports this module, so there is no cycle. The pump lives in its own module
// (utils/streams/node/fromReadable) rather than inline here so it can be exercised
// against any existing streamie, mirroring the pumpReadableStream/fromReadableStream
// split in the web entry.
import streamie from './index.js';
import pumpReadable from './utils/streams/node/fromReadable.js';

// Creates a streamie fed by a node:stream Readable. Items flow under backpressure (the
// stream is only consumed as fast as the pipeline absorbs items, bounded by
// backpressureAt); the stream ending drains the streamie, the stream erroring aborts it
// with that error, and the streamie terminating (drained, aborted, or halted —
// including a halt cascaded from a failure anywhere downstream) destroys the stream.
//
// The chunk type is a type parameter rather than inferred: a Node Readable is not
// generic over what it yields (it is `any`), so the caller names the type —
// fromReadable<Buffer>(req) — defaulting to unknown. The output is its Awaited because
// handler results are awaited, matching fromReadableStream: a stream of thenables emits
// their settled values.
export function fromReadable<T = unknown>(
  readable: Readable,
  config: Pick<Config, 'backpressureAt' | 'yieldAfter'> = {},
): Streamie<T, Awaited<T>> {
  const bridged = streamie((input: T) => input, config);
  pumpReadable(readable, bridged);
  return bridged;
}

// The mirror of fromReadable: exposes a streamie's outputs as a node:stream Readable
// (object mode by default), pull-driven so the consumer's reads pace the pipeline. The
// streamie draining ends the stream; an abort or halt errors it; the consumer
// destroying the stream detaches it from the streamie as a voluntary departure (no
// upstream cascade), the same as breaking a for-await.
export { default as toReadable } from './utils/streams/node/toReadable.js';

// Pipes a streamie's outputs into a node:stream Writable, resolving once the streamie
// has drained and the sink has finished. A streamie abort/halt destroys the sink; a
// sink failure aborts the streamie; either way the returned promise rejects with the
// terminating error. Backpressure flows through write()'s return value and the async
// iterator.
export { default as toWritable } from './utils/streams/node/toWritable.js';

// Types
import type { ReadableOptions } from 'node:stream';
import type { Streamie } from '../../../types';

// Construction side
import { Readable } from 'node:stream';

// Exposes a streamie's outputs *as* a node:stream Readable — the Node mirror of
// toReadableStream, and the one Node bridge that *constructs* a stream (so, like its
// WHATWG counterpart, it is the only one that imports a stream value rather than just
// typing one it receives).
//
// It is built on Readable.from over the streamie's own async iterator, so it inherits
// every consumer rule already proven there — backlog delivery, output broadcast to
// concurrent consumers, drain-as-done, halt-as-rejection — and Node's own object-mode
// read machinery for free. Readable.from is pull-driven: it advances the iterator only
// as its consumer reads, which paces the streamie, which builds backpressure up the
// pipeline. Termination maps in both directions, exactly as toReadableStream's does:
//   - streamie drains            -> the iterator completes -> stream ends ('end')
//   - streamie aborts/halts      -> the iteration rejects  -> stream errors ('error')
//   - stream consumer destroys   -> iterator.return()      -> a voluntary detach
//
// That last is the Node equivalent of a ReadableStream cancel or a for-await break:
// Readable.from calls the iterator's return() when the stream is destroyed, which
// unhooks this consumer from the streamie without aborting it — a surviving sibling
// consumer is unaffected, and a now-consumer-less streamie parks on its retained
// outputs rather than tearing down the pipeline.
//
// objectMode defaults to true (Readable.from's default): a streamie's outputs are
// arbitrary values, not necessarily Buffers/strings. A caller producing a byte stream
// can pass objectMode: false in options, having arranged for the outputs to be
// Buffer/Uint8Array/string.
//
// highWaterMark defaults to 1 in object mode, matching toReadableStream's default high
// water mark rather than Readable.from's object-mode default of 16. Left at 16, the
// produced stream would eagerly pull up to 16 items out of the streamie (and the
// pipeline behind it) into its own buffer ahead of a slow consumer — looser read
// backpressure than the WHATWG bridge, and a surprise for a library that otherwise
// reads exactly one item ahead. The default is scoped to object mode because there the
// high water mark is a count of items, where 1 is the tight mirror; in byte mode it is
// a byte count, so an item-count default of 1 would be meaningless. Byte-mode callers
// are left to size their own buffer (note Readable.from itself still defaults it to 1,
// not the 64 KB of new Readable(), so a real byte buffer wants an explicit value). All
// overridable through options.
export default function toReadable<O>(
  streamie: Streamie<any, O>,
  options?: ReadableOptions,
): Readable {
  const objectMode = options?.objectMode ?? true;
  return Readable.from(streamie, {
    ...(objectMode ? { highWaterMark: 1 } : {}),
    ...options,
  });
}

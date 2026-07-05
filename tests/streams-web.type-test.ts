import { fromReadableStream, toReadableStream, toWritableStream } from '../dist/esm/web.js';
import type { Streamie } from '../dist/esm/types.js';

/*
  Compiled against the DOM lib (tsconfig.dom-type-tests.json), unlike the core type
  tests, which are ES-lib only. The 'streamie/web' entry types against the real WHATWG
  stream globals (ReadableStream/WritableStream/QueuingStrategy), so chunk types flow by
  plain inference and the produced stream is a genuine ReadableStream — which the core,
  proven lib-agnostic without DOM, deliberately cannot express.
*/

type IsAny<T> = 0 extends (1 & T) ? true : false;

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2)
    ? ((<T>() => T extends B ? 1 : 2) extends
        (<T>() => T extends A ? 1 : 2)
          ? true
          : false)
    : false;

type Expect<T extends true> = T;
type NotAny<T> = IsAny<T> extends true ? false : true;

declare const numberReadable: ReadableStream<number>;
declare const numberWritable: WritableStream<number>;
declare const stringWritable: WritableStream<string>;

// fromReadableStream infers the chunk type straight from ReadableStream<T>.
const bridged = fromReadableStream(numberReadable);
export type Bridged_Streamie = Expect<Equal<typeof bridged, Streamie<number, number>>>;
export type Bridged_NotAny = Expect<NotAny<typeof bridged>>;

// The bridge accepts preventCancel alongside its core config subset.
fromReadableStream(numberReadable, { backpressureAt: 8, preventCancel: true });

// The motivating case: a fetch response body bridges directly. The chunk type flows
// through verbatim: since TypeScript 5.7 the typed arrays are generic over their backing
// buffer, and lib.dom types Response.body as ReadableStream<Uint8Array<ArrayBuffer>>, so
// the exact element type — buffer parameter and all — is what the bridge carries through.
declare const response: Response;
const body = fromReadableStream(response.body!);
export type Body_Items = Expect<Equal<typeof body, Streamie<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>>>;

// toWritableStream resolves void; the sink's chunk type must match the streamie output.
const piped = toWritableStream(bridged, numberWritable);
export type Piped_ResolvesVoid = Expect<Equal<typeof piped, Promise<void>>>;
// @ts-expect-error a Streamie<number, number> cannot pipe into a string sink
toWritableStream(bridged, stringWritable);

// toReadableStream produces a genuine ReadableStream<O> — the whole point of the move.
const produced = toReadableStream(bridged);
export type Produced_IsReadableStream = Expect<Equal<typeof produced, ReadableStream<number>>>;

// And because it is a real ReadableStream, DOM consumers accept it directly — no cast.
// These are exactly the README's examples; they must type-check.
new Response(produced);
const transformed: ReadableStream<string> = produced.pipeThrough(new TransformStream<number, string>());
declare function takesDomReadable(stream: ReadableStream<number>): void;
takesDomReadable(produced);

// A queuing strategy is accepted and constrains nothing about the chunk type.
toReadableStream(bridged, { highWaterMark: 4 });

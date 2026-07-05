import { fromReadable, toReadable, toWritable } from '../src/node.js';
import type { Streamie } from '../src/types.js';
import type { Readable } from 'node:stream';

/*
  Compiles against @types/node (present wherever the `streamie/node` entry is used),
  unlike the rest of the project, which is ES-lib only. The Node bridges type their
  streams against node:stream directly rather than the structural aliases the WHATWG
  bridges need to stay environment-agnostic — this entry is Node by definition.
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

declare const nodeReadable: Readable;

// fromReadable's chunk type is named by the caller (a Node Readable yields `any`), and
// the output is its Awaited.
const bridged = fromReadable<number>(nodeReadable);
export type Bridged_Items = Expect<Equal<typeof bridged, Streamie<number, number>>>;
export type Bridged_NotAny = Expect<NotAny<typeof bridged>>;

// A stream of thenables emits their settled values.
const settled = fromReadable<Promise<string>>(nodeReadable);
export type Settled_Items = Expect<Equal<typeof settled, Streamie<Promise<string>, string>>>;

// Default chunk type is unknown rather than any.
const untyped = fromReadable(nodeReadable);
export type Untyped_Items = Expect<Equal<typeof untyped, Streamie<unknown, unknown>>>;

// toReadable produces a genuine Node Readable.
const produced = toReadable(bridged);
export type Produced_IsReadable = Expect<Equal<typeof produced, Readable>>;

// toWritable returns a completion promise.
declare const nodeWritable: import('node:stream').Writable;
const piped = toWritable(bridged, nodeWritable);
export type Piped_IsVoidPromise = Expect<Equal<typeof piped, Promise<void>>>;

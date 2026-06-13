import { fromReadableStream, toWritableStream } from '../dist';
import type { Streamie } from '../dist/types';

/*
  Compiled against lib.dom (tsconfig.dom-type-tests.json), unlike the rest of the
  project and type tests, which are ES-lib only. This pins the README's claim that
  the bridges' structural stream types accept the real browser classes — the spots
  where lib.dom diverges from the local aliases being getReader's byob overload and
  the done read-result carrying value?: T rather than value?: undefined.
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

declare const browserReadable: ReadableStream<number>;
declare const browserWritable: WritableStream<number>;

const bridged = fromReadableStream(browserReadable);

export type Bridged_FromBrowserStream = Expect<
  Equal<typeof bridged, Streamie<number, number>>
>;
export type Bridged_NotAny = Expect<NotAny<typeof bridged>>;

const piped = toWritableStream(bridged, browserWritable);

export type Piped_FromBrowserStream = Expect<Equal<typeof piped, Promise<void>>>;

// The motivating case: a fetch response body bridges directly.
declare const response: Response;
const body = fromReadableStream(response.body!);

export type Body_Items = Expect<
  Equal<typeof body, Streamie<Uint8Array, Uint8Array>>
>;

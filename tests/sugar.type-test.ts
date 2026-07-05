import streamie, { from, merge } from '../dist/esm/index.js';
import type { Streamie, SinkStreamie } from '../dist/esm/types.js';

/*
  Compile-only type tests (run via `npm run test:types`) for the 2.0 sugar surface:
  flatMap, take, until, toArray, from, merge, retry/timeout config, and the
  SinkStreamie narrowing of .each/.sink.
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

type InputOf<S> = S extends Streamie<infer I, any, any> ? I : never;
type OutputOf<S> = S extends Streamie<any, infer O, any> ? O : never;
type ReceiptOf<S> = S extends Streamie<any, any, infer R> ? R : never;

const source = streamie((value: number) => value, {});

// ---------------------------------------------------------------------------
// flatMap
// ---------------------------------------------------------------------------

// Output is the element type of the returned array; the receipt is the whole array.
const flatMapped = source.flatMap((value) => [`${value}`, `${value}!`]);

export type FlatMapped_Output = Expect<Equal<OutputOf<typeof flatMapped>, string>>;
export type FlatMapped_Output_NotAny = Expect<NotAny<OutputOf<typeof flatMapped>>>;
export type FlatMapped_Receipt = Expect<Equal<ReceiptOf<typeof flatMapped>, string[]>>;

// Async handlers unwrap.
const asyncFlatMapped = source.flatMap(async (value) => [value, value + 1]);

export type AsyncFlatMapped_Output = Expect<Equal<OutputOf<typeof asyncFlatMapped>, number>>;

// A non-array handler return is a compile error.
// @ts-expect-error flatMap handlers must return arrays
source.flatMap((value) => value);

// ---------------------------------------------------------------------------
// take / until
// ---------------------------------------------------------------------------

const taken = source.take(3);
export type Taken_Output = Expect<Equal<OutputOf<typeof taken>, number>>;

const untilStage = source.until((value) => value > 10, { inclusive: true });
export type Until_Output = Expect<Equal<OutputOf<typeof untilStage>, number>>;

// The until predicate must produce a boolean.
// @ts-expect-error predicates return booleans
source.until((value) => value);

// ---------------------------------------------------------------------------
// toArray
// ---------------------------------------------------------------------------

const collected = source.map((value) => `${value}`).toArray();
export type Collected = Expect<Equal<typeof collected, Promise<string[]>>>;

// ---------------------------------------------------------------------------
// from / merge
// ---------------------------------------------------------------------------

const fromArray = from([1, 2, 3]);
export type FromArray_Output = Expect<Equal<OutputOf<typeof fromArray>, number>>;
export type FromArray_Input = Expect<Equal<InputOf<typeof fromArray>, number>>;

async function* asyncSource() { yield 'a'; }
const fromAsync = from(asyncSource());
export type FromAsync_Output = Expect<Equal<OutputOf<typeof fromAsync>, string>>;

// The helpers also ride on the default export.
export type FromOnDefault = Expect<Equal<typeof streamie.from, typeof from>>;
export type MergeOnDefault = Expect<Equal<typeof streamie.merge, typeof merge>>;

const merged = merge([from([1]), from([2])]);
export type Merged_Output = Expect<Equal<OutputOf<typeof merged>, number>>;

// The core awaits thenable handler returns, so promise elements settle in transit:
// the input type is what was fed, the output type what comes out downstream.
const fromPromises = from([Promise.resolve(1)]);
export type FromPromises_Input = Expect<Equal<InputOf<typeof fromPromises>, Promise<number>>>;
export type FromPromises_Output = Expect<Equal<OutputOf<typeof fromPromises>, number>>;

declare const promiseEmitter: Streamie<number, Promise<string>>;
const mergedSettled = merge([promiseEmitter]);
export type MergedSettled_Output = Expect<Equal<OutputOf<typeof mergedSettled>, string>>;

// A non-iterable source is a compile error.
// @ts-expect-error numbers are not iterable
from(42);

// ---------------------------------------------------------------------------
// retry / timeout config
// ---------------------------------------------------------------------------

streamie((value: number) => value, { retry: 3 });
streamie((value: number) => value, { retry: { attempts: 3, delay: 100 } });
streamie((value: number) => value, { retry: { attempts: 3, delay: (attempt) => attempt * 100 } });
streamie((value: number) => value, { timeout: 5_000 });

// @ts-expect-error retry objects require attempts
streamie((value: number) => value, { retry: { delay: 100 } });

// ---------------------------------------------------------------------------
// push: the canonical receipt-free push returns the bare backpressure boolean;
// push.withReceipt is the tracked variant
// ---------------------------------------------------------------------------

const pushBackpressure = source.push(1);
export type Push_ReturnsBoolean = Expect<Equal<typeof pushBackpressure, boolean>>;
// @ts-expect-error no receipt on the plain push: there is no promise to await
source.push(1).promise;
// @ts-expect-error push takes the streamie's input type
source.push('not a number');

const trackedReceipt = source.push.withReceipt(1);
export type PushWithReceipt_Backpressure = Expect<Equal<typeof trackedReceipt.backpressure, boolean>>;
// @ts-expect-error withReceipt takes the streamie's input type
source.push.withReceipt('not a number');

// Available to handlers as a tool, in both forms.
streamie((page: number, { push }) => {
  const toolBackpressure = push(page + 1);
  toolBackpressure satisfies boolean;
  const toolReceipt = push.withReceipt(page + 1);
  return toolReceipt.backpressure satisfies boolean;
}, {});

// ---------------------------------------------------------------------------
// SinkStreamie: .each/.sink offer no consumer-attaching members
// ---------------------------------------------------------------------------

const sunk = source.each((value) => { void value; });
export type Sunk_IsSink = Expect<Equal<typeof sunk, SinkStreamie<number, void>>>;

// The live members remain.
sunk.promise.catch(() => {});
sunk.push(1);
sunk.push.withReceipt(1);
sunk.drain();
sunk.state.isDrained;
sunk.onDrained(() => {});

// Consumer-attaching members are compile errors, not runtime throws.
// @ts-expect-error a sink has no consumable output to map
sunk.map((value) => value);
// @ts-expect-error a sink has no consumable output to iterate
sunk[Symbol.asyncIterator];
// @ts-expect-error a sink has no consumable output to collect
sunk.toArray();
// @ts-expect-error a sink cannot register consumers
sunk.registerOutput;

const sunkIdentity = source.sink();
export type SunkIdentity_IsSink = Expect<Equal<typeof sunkIdentity, SinkStreamie<number, number>>>;
// @ts-expect-error a sink cannot be chained further
sunkIdentity.each((value) => { void value; });

// A sink is still a legitimate consumer argument to registerOutput.
source.registerOutput(sunkIdentity);

import streamie from '../dist/esm/index.js';
import type { Streamie, StreamieHaltPayload, Tools } from '../dist/esm/types.js';
import type { StreamieQueueError } from '../dist/esm/error/index.js';

/*
  Run this with tsc, not Jest alone.

  Suggested script:
    "test:types": "tsc -p tsconfig.type-tests.json --noEmit"

  These tests assert the inference behavior of the public API: batching and
  flattening are expressed positionally via the batch/flatten combinators, so the
  item type at any point in a pipeline is plain (no conditional types driven by
  config objects).
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

// The third (R) argument must be `any`, not omitted: with the default R = O, writing
// Streamie<any, infer O> would pin R to the inferred O and fail to match a decoupled or
// flatten stage whose R differs from O.
type InputOf<S> = S extends Streamie<infer I, any, any> ? I : never;
type OutputOf<S> = S extends Streamie<any, infer O, any> ? O : never;
type ReceiptOf<S> = S extends Streamie<any, any, infer R> ? R : never;

type Comment = { id: string; body: string };

// ---------------------------------------------------------------------------
// Baseline inference
// ---------------------------------------------------------------------------

const source = streamie((value: number) => value, { seed: 1 });

export type Source_Input = Expect<Equal<InputOf<typeof source>, number>>;
export type Source_Output = Expect<Equal<OutputOf<typeof source>, number>>;
export type Source_Output_NotAny = Expect<NotAny<OutputOf<typeof source>>>;

// Array outputs are preserved as-is; flattening is opt-in via the combinator.
const arrayOutput = streamie((value: number) => [value, value + 1], { seed: 1 });

export type ArrayOutput_Output = Expect<
  Equal<OutputOf<typeof arrayOutput>, number[]>
>;
export type ArrayOutput_Output_NotAny = Expect<NotAny<
  OutputOf<typeof arrayOutput>
>>;

// Async handlers unwrap their promises.
const asyncOutput = streamie(async (value: number) => `${value}`, {});

export type AsyncOutput_Output = Expect<Equal<OutputOf<typeof asyncOutput>, string>>;

// ---------------------------------------------------------------------------
// flatten
// ---------------------------------------------------------------------------

const flattened = arrayOutput.flatten();

export type Flattened_Output = Expect<Equal<OutputOf<typeof flattened>, number>>;
export type Flattened_Output_NotAny = Expect<NotAny<OutputOf<typeof flattened>>>;

const flattenedMap = flattened.map(
  (value) => [{ id: String(value), body: 'body' } satisfies Comment],
).flatten();

export type FlattenedMap_Output = Expect<
  Equal<OutputOf<typeof flattenedMap>, Comment>
>;

// flatten is not callable when stream items are not arrays.
// @ts-expect-error
source.flatten();

// ---------------------------------------------------------------------------
// batch
// ---------------------------------------------------------------------------

const batched = source.batch(2);

export type Batched_Output = Expect<Equal<OutputOf<typeof batched>, number[]>>;

const batchedMap = batched.map((values, { push, index }) => {
  type HandlerInput = Expect<Equal<typeof values, number[]>>;
  type IndexType = Expect<Equal<typeof index, number>>;

  // After batch, the stream item is the batch itself, so push takes a batch.
  push(values);

  // @ts-expect-error push accepts number[] here, not number
  push(values[0]);

  return values.length;
});

export type BatchedMap_Output = Expect<
  Equal<OutputOf<typeof batchedMap>, number>
>;

// Batching then flattening round-trips back to the element type.
const roundTripped = source.batch(2).flatten();

export type RoundTripped_Output = Expect<
  Equal<OutputOf<typeof roundTripped>, number>
>;

// ---------------------------------------------------------------------------
// filter
// ---------------------------------------------------------------------------

const filtered = source.filter((value) => value > 0);

export type Filtered_Output = Expect<Equal<OutputOf<typeof filtered>, number>>;

const batchedFilter = source.batch(2).filter((values) => {
  type HandlerInput = Expect<Equal<typeof values, number[]>>;
  return values.every((value) => value > 0);
});

export type BatchedFilter_Output = Expect<
  Equal<OutputOf<typeof batchedFilter>, number[]>
>;

// Filter predicates must return booleans.
// @ts-expect-error filter predicates return boolean, not string
source.filter((value) => `${value}`);

// ---------------------------------------------------------------------------
// produce / reduce / scan
// ---------------------------------------------------------------------------

// produce decouples output from return: the output type comes from an explicit type
// argument (and types emit), while the receipt tracks the return value.
const produced = source.produce<string>((value, { emit }) => {
  emit(`#${value}`);
  // @ts-expect-error emit only accepts the declared output type
  emit(123);
  return value;
});
export type Produced_Output = Expect<Equal<OutputOf<typeof produced>, string>>;

// An annotation on the emit parameter keeps both the output and the receipt precise.
const producedAnnotated = source.produce((value, { emit }: Tools<number, boolean>) => {
  emit(value % 2 === 0);
  return value;
});
export type ProducedAnnotated_Output = Expect<Equal<OutputOf<typeof producedAnnotated>, boolean>>;
export type ProducedAnnotated_Receipt = Expect<Equal<ReceiptOf<typeof producedAnnotated>, number>>;

// reduce aggregates to the accumulator type, emitted once; the receipt is the accumulator.
const reduced = source.reduce((acc, value) => acc + value, 0);
export type Reduced_Output = Expect<Equal<OutputOf<typeof reduced>, number>>;
export type Reduced_Receipt = Expect<Equal<ReceiptOf<typeof reduced>, number>>;
export type Reduced_Output_NotAny = Expect<NotAny<OutputOf<typeof reduced>>>;

// The accumulator type is free to differ from the item type.
const grouped = source.reduce(
  (acc: Record<string, number[]>, value) => acc,
  {} as Record<string, number[]>,
);
export type Grouped_Output = Expect<Equal<OutputOf<typeof grouped>, Record<string, number[]>>>;

// reduce's reducer must return the accumulator type.
// @ts-expect-error reducer must return the accumulator type (number), not string
source.reduce((acc, value) => `${acc + value}`, 0);

// An async reducer is permitted and unwraps to the accumulator type.
const reducedAsync = source.reduce(async (acc, value) => acc + value, 0);
export type ReducedAsync_Output = Expect<Equal<OutputOf<typeof reducedAsync>, number>>;

// scan has the same shape as reduce, emitting the accumulator after each item.
const scanned = source.scan((acc, value) => `${acc}${value}`, '');
export type Scanned_Output = Expect<Equal<OutputOf<typeof scanned>, string>>;
export type Scanned_Receipt = Expect<Equal<ReceiptOf<typeof scanned>, string>>;

// ---------------------------------------------------------------------------
// Paginator-style inference (tools included)
// ---------------------------------------------------------------------------

const comments = streamie(async (after: string | null, { push, drain }) => {
  if (after) push(after);
  else drain();

  return [{ id: 'id', body: 'body' } satisfies Comment];
}, { seed: null });

export type Comments_Output = Expect<Equal<OutputOf<typeof comments>, Comment[]>>;

const flattenedComments = comments.flatten();

export type FlattenedComments_Output = Expect<
  Equal<OutputOf<typeof flattenedComments>, Comment>
>;

const commentIds = flattenedComments.map((comment, { index }) => {
  type HandlerInput = Expect<Equal<typeof comment, Comment>>;
  type IndexType = Expect<Equal<typeof index, number>>;
  return comment.id;
});

export type CommentIds_Output = Expect<
  Equal<OutputOf<typeof commentIds>, string>
>;

// Seed should conform to the handler input type; it should not take over input inference.
streamie((after: string | null) => after, { seed: null });

// @ts-expect-error seed must be string | null because the handler input is string | null
streamie((after: string | null) => after, { seed: 123 });

// ---------------------------------------------------------------------------
// Internal configuration is not part of the public API
// ---------------------------------------------------------------------------

// @ts-expect-error batching is configured via the batch combinator, not config
streamie((values: number[]) => values, { batchSize: 2 });

// @ts-expect-error flattening is configured via the flatten combinator, not config
streamie((value: number) => [value], { flatten: true });

// @ts-expect-error isFilter is internal-only
streamie((value: number) => true, { isFilter: true });

// @ts-expect-error maxBatchWait belongs to the batch combinator's config
streamie((value: number) => value, { maxBatchWait: 100 });

// The yield budget, by contrast, is public config.
streamie((value: number) => value, { yieldAfter: 50 });

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const source1 = streamie((value: number) => value, {});

source1.push(1);

// @ts-expect-error push accepts exactly one item
source1.push(1, 2, 3, 4);

source1.map((value, { push }) => {
  push(value);

  // @ts-expect-error handler helper push accepts exactly one input item
  push(1, 2);

  // The tools push exposes the synchronous receipt metadata (but not the receipt's
  // promise, whose type would be circular with the handler's own return type).
  const toolsPushResult = push(value);
  type ToolsPush_Backpressure = Expect<Equal<typeof toolsPushResult.backpressure, boolean>>;

  return value * 2;
});

// ---------------------------------------------------------------------------
// Push receipts
// ---------------------------------------------------------------------------

const pushReceipt = source1.push(1);

export type PushReceipt_Backpressure = Expect<
  Equal<typeof pushReceipt.backpressure, boolean>
>;

// A receipt's promise resolves with the streamie's output type.
export type PushReceipt_Output = Expect<
  Equal<typeof pushReceipt.promise, Promise<number>>
>;
export type PushReceipt_Output_NotAny = Expect<NotAny<
  Awaited<typeof pushReceipt.promise>
>>;

// A batch stage's receipt resolves with the batch the item joined.
const batchReceipt = batched.push(1);

export type BatchReceipt_Output = Expect<
  Equal<typeof batchReceipt.promise, Promise<number[]>>
>;

// @ts-expect-error push accepts numbers here, not strings
source1.push('1');

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

// Subscriptions return unsubscribe functions, for both persistent and once handlers.
const offDrained = source1.onDrained(() => {});
export type OnDrained_ReturnsUnsubscribe = Expect<Equal<typeof offDrained, () => void>>;

const offBackpressureOnce = source1.onBackpressureRelease.once(() => {});
export type Once_ReturnsUnsubscribe = Expect<
  Equal<typeof offBackpressureOnce, () => void>
>;

// The error event's payload is the streamie's own queue error type.
source1.onError((error) => {
  type ErrorPayload = Expect<Equal<typeof error, StreamieQueueError<number>>>;
  type ErrorPayload_NotAny = Expect<NotAny<typeof error>>;
});

// abort accepts an optional arbitrary error — not constrained to StreamieQueueError.
export type Abort_Signature = Expect<
  Equal<typeof source1.abort, (error?: unknown) => void>
>;

// The halted event's payload reports how the halt came about.
source1.onHalted((payload) => {
  type HaltPayload = Expect<Equal<typeof payload, StreamieHaltPayload<number>>>;
  type HaltPayload_LastError = Expect<
    Equal<typeof payload.lastError, StreamieQueueError<number> | null>
  >;
  type HaltPayload_NotAny = Expect<NotAny<typeof payload>>;
});

// Zero-argument handlers remain assignable to events that carry payloads.
source1.onHalted(() => {});

// Sinks: each is a terminal map (handler inference unchanged), sink() appends an
// identity terminal stage, and sink: true is plain config — as is keepAlive, the
// opt-out from the downstream halt cascade.
const stringifier = streamie((value: number) => String(value), {});
const eached = stringifier.each((value) => value.length);
export type Each_Streamie = Expect<Equal<typeof eached, Streamie<string, number>>>;
const sunk = stringifier.map((value) => value.length).sink();
export type Sink_Streamie = Expect<Equal<typeof sunk, Streamie<number, number>>>;
streamie((value: number) => value, { sink: true });
streamie((value: number) => value, { keepAlive: true });

// The web stream bridges' inference is covered in streams-web.type-test.ts, which runs
// under the DOM lib because they type against the real WHATWG stream globals.

// Prevent accidental widening to any in the core inference path.
export type _NoUnexpectedAny = [
  Expect<NotAny<OutputOf<typeof source>>>,
  Expect<NotAny<OutputOf<typeof flattened>>>,
  Expect<NotAny<OutputOf<typeof batched>>>,
  Expect<NotAny<OutputOf<typeof comments>>>,
];

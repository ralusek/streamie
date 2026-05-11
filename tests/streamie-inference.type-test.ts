import streamie from '../dist';
import type { BatchedIfConfigured, Config, Streamie } from '../dist/types';

/*
  Run this with tsc/tsd, not Jest alone.

  Suggested script:
    "test:types": "tsc -p tsconfig.type-tests.json --noEmit"

  These tests intentionally assert the behavior you WANT from inference. A few of
  them are expected to fail against the current type definitions; those failures
  are the point of the file.
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
type ConfigOf<S> = S extends Streamie<any, any, infer C> ? C : never;

type Comment = { id: string; body: string };

// ---------------------------------------------------------------------------
// Baseline utility tests
// ---------------------------------------------------------------------------

export type BatchedIfConfigured_BatchSize1 = Expect<
  Equal<BatchedIfConfigured<number, { batchSize: 1 }>, number>
>;

export type BatchedIfConfigured_BatchSize5 = Expect<
  Equal<BatchedIfConfigured<number, { batchSize: 5 }>, number[]>
>;

export type BatchedIfConfigured_NoBatchSize = Expect<
  Equal<BatchedIfConfigured<number, {}>, number>
>;

// ---------------------------------------------------------------------------
// Baseline inference tests that should already work
// ---------------------------------------------------------------------------

const source = streamie((value: number) => value, { seed: 1 });

export type Source_Input = Expect<Equal<InputOf<typeof source>, number>>;
export type Source_Output = Expect<Equal<OutputOf<typeof source>, number>>;
export type Source_Output_NotAny = Expect<NotAny<OutputOf<typeof source>>>;

const flattenedTopLevel = streamie(
  (id: number) => [{ id: String(id), body: 'body' } satisfies Comment],
  { seed: 1, flatten: true },
);

export type FlattenedTopLevel_Output = Expect<
  Equal<OutputOf<typeof flattenedTopLevel>, Comment>
>;
export type FlattenedTopLevel_Output_NotAny = Expect<NotAny<
  OutputOf<typeof flattenedTopLevel>
>>;

const flattenedMap = source.map(
  (value) => [{ id: String(value), body: 'body' } satisfies Comment],
  { flatten: true },
);

export type FlattenedMap_Output = Expect<
  Equal<OutputOf<typeof flattenedMap>, Comment>
>;
export type FlattenedMap_Output_NotAny = Expect<NotAny<
  OutputOf<typeof flattenedMap>
>>;

const batchedMap = source.map((values, { push, index }) => {
  type HandlerInput = Expect<Equal<typeof values, number[]>>;
  type IndexType = Expect<Equal<typeof index, number>>;

  values.forEach(push);

  // The helper push should still push one input item, not the whole batch.
  // @ts-expect-error push accepts number, not number[]
  push(values);

  return values.length;
}, { batchSize: 2 });

export type BatchedMap_Output = Expect<
  Equal<OutputOf<typeof batchedMap>, number>
>;

const batchedFilterWithoutFlatten = source.filter((values) => {
  type HandlerInput = Expect<Equal<typeof values, number[]>>;
  return values.every((value) => value > 0);
}, { batchSize: 2 });

export type BatchedFilterWithoutFlatten_Output = Expect<
  Equal<OutputOf<typeof batchedFilterWithoutFlatten>, number[]>
>;

const comments = streamie(async (after: string | null, { push, drain }) => {
  if (after) push(after);
  else drain();

  return [{ id: 'id', body: 'body' } satisfies Comment];
}, { seed: null, flatten: true });

const commentIds = comments.map((comment, { index }) => {
  type HandlerInput = Expect<Equal<typeof comment, Comment>>;
  type IndexType = Expect<Equal<typeof index, number>>;
  return comment.id;
}, {});

export type CommentIds_Output = Expect<
  Equal<OutputOf<typeof commentIds>, string>
>;

// Seed should conform to the handler input type; it should not take over input inference.
streamie((after: string | null) => after, { seed: null });

// @ts-expect-error seed must be string | null because the handler input is string | null
streamie((after: string | null) => after, { seed: 123 });

// Widening a config object to Config erases the literal batchSize. This is a
// useful negative test/documentation case, not a bug in streamie.
const widenedBatchConfig: Config = { batchSize: 2 };

// @ts-expect-error widened Config does not prove that the handler receives a batch
source.map((values: number[]) => values.length, widenedBatchConfig);

const preservedBatchConfig = { batchSize: 2 } as const satisfies Config;
const mapWithPreservedConfig = source.map((values) => {
  type HandlerInput = Expect<Equal<typeof values, number[]>>;
  return values.length;
}, preservedBatchConfig);

export type MapWithPreservedConfig_Output = Expect<
  Equal<OutputOf<typeof mapWithPreservedConfig>, number>
>;

// ---------------------------------------------------------------------------
// CURRENTLY FAILING DESIRED-INFERENCE TESTS
// ---------------------------------------------------------------------------

// Desired behavior: when flatten is absent, arrays should be valid output items.
// Current behavior: the conditional return type often tries to infer the array
// element as OQT and rejects the handler.
const nonFlattenedArrayOutput = streamie(
  (value: number) => [value, value + 1],
  { seed: 1 },
);

export type NonFlattenedArrayOutput_Output = Expect<
  Equal<OutputOf<typeof nonFlattenedArrayOutput>, number[]>
>;
export type NonFlattenedArrayOutput_Output_NotAny = Expect<NotAny<
  OutputOf<typeof nonFlattenedArrayOutput>
>>;

// Desired behavior: explicit flatten:false should also preserve array outputs.
const explicitNonFlattenedArrayOutput = streamie(
  (value: number) => [value, value + 1],
  { seed: 1, flatten: false },
);

export type ExplicitNonFlattenedArrayOutput_Output = Expect<
  Equal<OutputOf<typeof explicitNonFlattenedArrayOutput>, number[]>
>;

// Desired behavior: map(..., {}) should preserve array outputs unless flatten:true.
const mappedArrayOutput = source.map(
  (value) => [value, value + 1],
  {},
);

export type MappedArrayOutput_Output = Expect<
  Equal<OutputOf<typeof mappedArrayOutput>, number[]>
>;

// Desired behavior: map(..., { flatten:false }) should also preserve array outputs.
const explicitNonFlattenedMappedArrayOutput = source.map(
  (value) => [value, value + 1],
  { flatten: false },
);

export type ExplicitNonFlattenedMappedArrayOutput_Output = Expect<
  Equal<OutputOf<typeof explicitNonFlattenedMappedArrayOutput>, number[]>
>;

// Desired behavior: filter handlers return boolean even when the filter output
// is flattened. Runtime treats this as a predicate; it should not require boolean[].
const flattenedBatchedFilter = source.filter((values) => {
  type HandlerInput = Expect<Equal<typeof values, number[]>>;
  return values.every((value) => value > 0);
}, { batchSize: 2, flatten: true });

// Desired behavior: flattening a batched filter should emit individual input items.
export type FlattenedBatchedFilter_Output = Expect<
  Equal<OutputOf<typeof flattenedBatchedFilter>, number>
>;
export type FlattenedBatchedFilter_Output_NotAny = Expect<NotAny<
  OutputOf<typeof flattenedBatchedFilter>
>>;

// Desired behavior: after a flattened batched filter, the next map should receive
// one Comment at a time, not Comment[].
const flattenedCommentBatchFilter = comments.filter((batch) => {
  type HandlerInput = Expect<Equal<typeof batch, Comment[]>>;
  return batch.every((comment) => comment.id.length > 0);
}, { batchSize: 2, flatten: true });

const idsAfterFlattenedBatchFilter = flattenedCommentBatchFilter.map((comment) => {
  type HandlerInput = Expect<Equal<typeof comment, Comment>>;
  return comment.id;
}, {});

export type IdsAfterFlattenedBatchFilter_Output = Expect<
  Equal<OutputOf<typeof idsAfterFlattenedBatchFilter>, string>
>;
// Desired behavior: if the stream item itself is an array, filter(..., { flatten:true })
// should emit the array elements, because runtime flattening iterates handlerInput.
declare const arrayItemSource: Streamie<number, number[], {}>;

const flattenedArrayItemFilter = arrayItemSource.filter((arrayItem) => {
  type HandlerInput = Expect<Equal<typeof arrayItem, number[]>>;
  return arrayItem.length > 0;
}, { flatten: true });

export type FlattenedArrayItemFilter_Output = Expect<
  Equal<OutputOf<typeof flattenedArrayItemFilter>, number>
>;

// ---------------------------------------------------------------------------
// CURRENTLY FAILING DESIRED-ERROR TESTS
// ---------------------------------------------------------------------------

// Desired behavior: flatten:true handlers must return arrays.
// This should already be rejected by the current types.
// @ts-expect-error flatten:true requires an array return value
streamie((value: number) => `value:${value}`, { seed: 1, flatten: true });

// Desired behavior: filter handlers should return boolean, not boolean[], even
// when flatten:true. Current types tend to accept this because flatten is applied
// to the boolean predicate return type.
// @ts-expect-error filter predicates should return boolean, not boolean[]
source.filter((values) => values.map((value) => value > 0), {
  batchSize: 2,
  flatten: true,
});

// Prevent accidental widening to any in the core inference path.
export type _NoUnexpectedAny = [
  Expect<NotAny<OutputOf<typeof source>>>,
  Expect<NotAny<OutputOf<typeof flattenedTopLevel>>>,
  Expect<NotAny<OutputOf<typeof flattenedMap>>>,
  Expect<NotAny<OutputOf<typeof comments>>>,
];

// @ts-expect-error cannot flatten a filter whose handler input is not an array
source.filter((value) => value > 0, { flatten: true });

// @ts-expect-error direct public isFilter is internal-only
streamie((n: number) => true, { seed: 1, isFilter: true });

const source1 = streamie((value: number) => value, {});

source1.push(1);
source1.push(1, 2, 3, 4);

source1.map((values, { push }) => {
  values.forEach(push);

  // @ts-expect-error handler helper push accepts exactly one input item
  push(1, 2);

  return values.length;
}, { batchSize: 2 });

import streamie from '../dist/esm/index.js';
import type { Streamie, Tools, Config } from '../dist/esm/types.js';

/*
  Run with tsc, not Jest (see test:types). Asserts the typing of the decoupled-output
  form (automaticallyEmit: false): the stage's output type comes from the caller — an
  explicit type argument or an annotation on the emit parameter — and types tools.emit,
  while the default form keeps inferring output from the handler's return value.

  The thing NOT asserted, because TypeScript cannot do it: inferring the output type
  from emit() calls in the handler body. There is no test for `head.map((x, { emit }) =>
  { emit('s'); }, { automaticallyEmit: false })` producing Streamie<_, string> — it
  produces Streamie<_, unknown>, the documented limitation (covered below).
*/

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2)
    ? ((<T>() => T extends B ? 1 : 2) extends
        (<T>() => T extends A ? 1 : 2) ? true : false)
    : false;
type Expect<T extends true> = T;
// R argument is `any` (not omitted): with the default R = O, a two-argument pattern
// would pin R = O and fail to match a decoupled stage whose receipt type differs.
type OutputOf<S> = S extends Streamie<any, infer O, any> ? O : never;
type ReceiptOf<S> = S extends Streamie<any, any, infer R> ? R : never;

const head = streamie((value: number) => value, { seed: 1 });

// ---------------------------------------------------------------------------
// Decoupled output via an explicit type argument
// ---------------------------------------------------------------------------

const explicit = head.map<string>((value, { emit }) => {
  // emit is typed to the explicit output type.
  emit(`#${value}`);
  // @ts-expect-error emit only accepts the declared output type
  emit(123);
  // The return value feeds only the receipt, so it is unconstrained by the output type.
  return value;
}, { automaticallyEmit: false });

export type Explicit_Output = Expect<Equal<OutputOf<typeof explicit>, string>>;

// ---------------------------------------------------------------------------
// Decoupled output via an annotation on the emit parameter
// ---------------------------------------------------------------------------

const annotated = head.map((value, { emit }: Tools<number, boolean>) => {
  emit(value % 2 === 0);
}, { automaticallyEmit: false });

export type Annotated_Output = Expect<Equal<OutputOf<typeof annotated>, boolean>>;

// ---------------------------------------------------------------------------
// Documented limitation: no type argument or annotation -> output is unknown
// ---------------------------------------------------------------------------

const unannotated = head.map((value, { emit }) => {
  emit(`#${value}`); // permitted — emit is (output: unknown) => void here
}, { automaticallyEmit: false });

export type Unannotated_Output = Expect<Equal<OutputOf<typeof unannotated>, unknown>>;

// ---------------------------------------------------------------------------
// Default form still infers output from the return value (regression guard)
// ---------------------------------------------------------------------------

const mappedSync = head.map((value) => `#${value}`);
export type MappedSync_Output = Expect<Equal<OutputOf<typeof mappedSync>, string>>;

const mappedAsync = head.map(async (value) => value * 2);
export type MappedAsync_Output = Expect<Equal<OutputOf<typeof mappedAsync>, number>>;

// Decoupling is selected only by an inline literal automaticallyEmit: false. It is not a
// public Config field, so it cannot be carried in (and widened by) a Config-typed value —
// which would otherwise type the stage as auto-emit while it runs decoupled.
// @ts-expect-error automaticallyEmit is not part of the public Config
const widenedDecouple: Config = { automaticallyEmit: false };

// The structural case: an inferred object literal with a *real* Config property alongside
// automaticallyEmit: false is still assignable to Config (extra properties are allowed for
// a variable), so the auto-emit overload has to reject the discriminant explicitly. Both
// .map and the factory must error rather than silently typing this as auto-emit.
const smuggleConfig = { haltOnError: true, automaticallyEmit: false };
// @ts-expect-error a config carrying automaticallyEmit: false matches neither overload
head.map((value) => value * 2, smuggleConfig);
// @ts-expect-error same for the streamie factory
streamie((value: number) => value * 2, smuggleConfig);

// And a plain Config (without it) still drives a normal auto-emit map.
const plainConfig: Config = {};
const mappedPlainConfig = head.map((value) => value > 0, plainConfig);
export type MappedPlainConfig_Output = Expect<Equal<OutputOf<typeof mappedPlainConfig>, boolean>>;

// ---------------------------------------------------------------------------
// The decoupled factory form
// ---------------------------------------------------------------------------

const sourceExplicit = streamie<number, string>((value, { emit }) => {
  emit(`#${value}`);
  // @ts-expect-error emit only accepts the declared output type
  emit(true);
}, { automaticallyEmit: false });

export type SourceExplicit_Output = Expect<Equal<OutputOf<typeof sourceExplicit>, string>>;

const sourceAnnotated = streamie((value: number, { emit }: Tools<number, string>) => {
  emit(`#${value}`);
}, { automaticallyEmit: false });

export type SourceAnnotated_Output = Expect<Equal<OutputOf<typeof sourceAnnotated>, string>>;

// The default factory form is unaffected.
const sourceDefault = streamie((value: number) => value > 0, {});
export type SourceDefault_Output = Expect<Equal<OutputOf<typeof sourceDefault>, boolean>>;

// ---------------------------------------------------------------------------
// emit is unavailable in an auto-emit handler (soundness: output IS the return
// value there, so a stray emit would be a second, untracked output source). The
// default Tools emit is typed `never`, making any such call a type error.
// ---------------------------------------------------------------------------

head.map((value, { emit }) => {
  // @ts-expect-error emit is unusable (never) in an auto-emit handler
  emit(`#${value}`);
  return value;
});

streamie((value: number, { emit }) => {
  // @ts-expect-error emit is unusable (never) in an auto-emit handler
  emit(value);
  return value;
}, {});

// ---------------------------------------------------------------------------
// Receipt type (R) tracks the handler's RETURN value, distinct from output
// ---------------------------------------------------------------------------

// Explicit-output form (`.map<string>`): output is precise, but the receipt type is
// unknown — once NO is given as an explicit type argument, NR can no longer be inferred
// from the return (TS explicit type args are all-or-nothing), so it falls to its default.
export type Explicit_Receipt = Expect<Equal<ReceiptOf<typeof explicit>, unknown>>;

// Annotation form keeps BOTH precise: output from the emit annotation, receipt from the
// return. Here output is boolean and the receipt resolves with the returned number.
const annotatedWithReturn = head.map((value, { emit }: Tools<number, boolean>) => {
  emit(value % 2 === 0);
  return value;
}, { automaticallyEmit: false });
export type AnnotatedWithReturn_Output = Expect<Equal<OutputOf<typeof annotatedWithReturn>, boolean>>;
export type AnnotatedWithReturn_Receipt = Expect<Equal<ReceiptOf<typeof annotatedWithReturn>, number>>;
const annotatedReceipt = annotatedWithReturn.push.withReceipt(0).promise;
export type AnnotatedWithReturn_ReceiptPromise = Expect<Equal<typeof annotatedReceipt, Promise<number>>>;

// For an auto-emit stage, output and receipt coincide.
export type MappedSync_Receipt = Expect<Equal<ReceiptOf<typeof mappedSync>, string>>;

// flatten: output is the element type, but the receipt is the whole pre-flatten array.
const arrays = streamie((n: number) => [n, n * 2], {});
const flattened = arrays.flatten();
export type Flattened_Output = Expect<Equal<OutputOf<typeof flattened>, number>>;
export type Flattened_Receipt = Expect<Equal<ReceiptOf<typeof flattened>, number[]>>;

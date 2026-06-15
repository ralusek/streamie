<img width="450px"  src="https://i.imgur.com/Cp7IQHq.png" title="logo"/>

## Streamie: It's ex-streamie cool!

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/ralusek/streamie/blob/master/LICENSE)
[![npm version](https://img.shields.io/npm/v/streamie.svg?style=flat)](https://www.npmjs.com/package/streamie)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/ralusek/streamie/blob/master/LICENSE)

### What is a streamie?

A streamie is a **concurrent async data pipeline with automatic backpressure**, wearing the
interface of an array. You write `.map`, `.filter`, `.batch`, `.flatten`, `.each` over a
collection that is asynchronous and potentially infinite; every handler is `async`, every
stage runs at a concurrency you choose, and the whole chain self-regulates so no stage ever
races ahead of what the next can absorb.

```ts
await streamie(async (page: number, { push, drain }) => {
  const { items, hasMore } = await fetchPage(page);
  hasMore ? push(page + 1) : drain();
  return items;                        // a page of records
}, { seed: 0 })
  .flatten()                           // → individual records
  .map(enrich, { concurrency: 8 })     // 8 in flight, no more
  .batch(25)                           // → groups of 25
  .each(bulkUpload, { concurrency: 4 })// 4 uploads in flight
  .promise;                            // resolves when fully drained; rejects on failure
```

### Where it fits (and where it doesn't)

Reach for a streamie when the problem is **processing data**: ETL, scraping/pagination, job
queues, fan-out/fan-in over network or disk, streaming transforms. Its peer group is
Highland.js, Node object-mode streams, and the `p-map`/`p-queue` family — and against those
its edge is doing the *whole* job (concurrency **and** backpressure **and** batching **and**
rigorous completion/error semantics) behind one familiar interface, with TypeScript
inference that flows through every stage.

It is **not** a reactive-programming library, and is not trying to replace one. If you need
to compose *events over time* — `debounceTime`, `combineLatest`, `withLatestFrom`, `zip`,
`switchMap`, multicasting subjects, marble testing — that is RxJS's domain and you should
use RxJS. The reverse is also true: RxJS is push-based and has no real backpressure, so for
a fast producer feeding slow async work it will buffer unboundedly while a streamie simply
stalls the producer. Different tools, different jobs.

### What you get

  - **Backpressure, automatically.** Bounded queues at every stage mean a slow consumer
    transparently slows the producers feeding it — no unbounded buffering, no dropped items,
    no manual `bufferTime`/`sample` juggling. Pushes return a [receipt](#push-receipts)
    carrying both the item's completion promise and a cooperative backpressure signal.
  - **Per-stage concurrency.** Any iterative method takes a `concurrency` to parallelize that
    stage, and that parallelism is itself backpressure-correct — it never lets a stage
    outrun what's downstream.
  - **Batch / flatten as stages, not flags.** `.batch(n)` groups items into arrays of up to
    `n`; `.flatten()` emits the elements of array items individually. Because they're real
    pipeline stages, the item type at every point in the chain stays concrete and inference
    flows without annotations.
  - **Promise-native handlers everywhere.** A handler returning a promise is awaited before
    its item counts as processed — `async`/`await` is the native idiom, not an adapter.
  - **Rigorous lifecycle.** Graceful [`drain()`](#drainingcompletionpromises), abnormal
    [`abort()`](#aborting), failure that cascades both downstream and upstream with precise
    survival rules, [sinks](#sinks-each-sink-and-output-retention) and output retention,
    latching lifecycle [events](#events), and a `.promise` that resolves on completion and
    rejects on failure. Knowing exactly when a pipeline is *done* — or *why* it stopped — is
    a first-class feature, not an afterthought.
  - **Speaks the platform's protocols.** Every streamie is an
    [async iterable](#async-iteration), and both [Web Streams](#web-streams) and
    [Node streams](#node-streams) bridge directly in and out, so it drops into existing
    code without ceremony.

# Installation
`npm install --save streamie`

# Examples

## Pagination
```ts
const paginator = streamie(async (page: number, { push }) => {
  // Fetch data from an API or other source.
  const data = await fetchData(page);
  // If there's more data, push a new item into the streamie queue for handling.
  if (data.hasMore) {
    push(page + 1);
  }
  // Return the data to be processed by downstream functions.
  return data.items;
}, {});

// Start the streamie with the first page.
paginator.push(0);
```

Note, data sources like this which are producing their own inputs can be self-seeded
like this:

```ts
const paginator = streamie(async (page: number, { push }) => {
  // Fetch data from an API or other source.
  const data = await fetchData(page);
  // If there's more data, push a new item into the streamie queue for handling.
  if (data.hasMore) {
    push(page + 1);
  }
  // Return the data to be processed by downstream functions.
  return data.items;
}, { seed: 0 }); // Automatically push this in as a starting value to begin processing
```

## Flattening

Well, imagine that this `fetchData` returns 50 items at a time, and we want to handle them
individually for some purpose.

We can begin by flattening the output of this streamie, so rather than streaming out in
chunks of 50, they stream out as individual items.

```ts
const items = streamie(async (page: number, { push }) => {
  const data = await fetchData(page);
  if (data.hasMore) {
    push(page + 1);
  }
  return data.items;
}, { seed: 0 })
.flatten();
```

Now let's do an example of handling them individually. `.each` is the terminal
counterpart to `.map` — a forEach, for when the handler is the end of the line (see
Sinks below):

```ts
items
.each((item) => {
  return doSomethingIndividually(item);
});
```

## Batching

Or we can go in the opposite direction, where we're then going to take these individual items
streaming out, and we have an api we can use that can accept 10 of them in a single request.
`.batch(10)` will group up the items into arrays of that size before passing them on.

```ts
items
.batch(10)
.each((batch) => {
  return upload10AtATime(batch);
});
```

## Concurrency

Well what if this API let us do that, and said we could upload 10 in a single request, and perform
5 of those requests simultaneously?

```ts
items
.batch(10)
.each((batch) => {
  return upload10AtATime(batch);
}, { concurrency: 5 });
```

## Draining/Completion/Promises

And what happens when we're done? Well, you can call `streamie.drain()` to drain the remainder of the items.
A `.batch(n)` stage being drained is allowed to emit a final batch smaller than `n` in order to fully drain.
Upstream streamies will signal to downstream ones to drain when all of their inputs have
drained.

Every streamie returns a promise that will be resolved upon being fully drained. A streamie's handler can also
drain itself, such as the case with our paginator:

```ts
const paginator = streamie(async (page: number, { push, drain }) => {
  const data = await fetchData(page);
  if (data.hasMore) {
    push(page + 1);
  } else drain();
  return data.items;
}, { seed: 0 });
```

And to mark the process complete with the promise, here's the whole thing:

```ts
await paginator
.flatten()
.batch(10)
.each((batch) => {
  return upload10AtATime(batch);
}, { concurrency: 5 })
.promise;

// Here, the process is complete.
```

## Sinks: `.each`, `.sink()`, and output retention

A streamie produces outputs for consumers, and one with no consumers does not
throw that work away: it *retains* its outputs — delivering them to a consumer
attached later — and once the retained queue reaches `backpressureAt.output` it
stops processing, stalling everything upstream through ordinary backpressure.
Producing into the void is never ambient. A consequence worth internalizing: a
pipeline whose final stage is neither consumed nor a sink will park rather than
drain (undelivered outputs remain), so its `.promise` will never resolve.

The end of a pipeline is therefore declared explicitly:

  - `.each(handler, config?)` — a terminal `.map`, i.e. a forEach: the handler is
    the endpoint. This is the usual way to finish a pipeline of side effects.
  - `.sink(config?)` — appends an identity terminal stage, for chains of pure
    transforms where reaching the end is itself the point.
  - `{ sink: true }` — the lower-level config flag both are sugar for, for a
    standalone streamie that is itself the endpoint.

A sink discards its outputs as they settle — they never even reach an output
queue, so a sink builds no output backpressure (`backpressureAt.output` on a sink
stage has no effect) — and registering a consumer on one throws: its output is
declared unobserved. Await the sink's `.promise` for pipeline completion, as in
the example above.

One distinction worth internalizing: retention is for *absent* consumers, not
failed ones. A streamie retains outputs when no consumer has attached yet, or when
its consumers detached voluntarily (a drain, an iterator `break`). If its consumers
are instead lost to failure — a terminal stage halting on an error — the streamie
doesn't park on their behalf: the failure cascades upstream and halts it too (see
Aborting), rejecting every stage's promise with the root error.

## Aborting

Draining is the graceful finish; `abort(error?)` is the abnormal one. It terminates
the streamie immediately: queued items are abandoned, the streamie's promise and any
queued push receipts reject with the given error (or a generic one for a bare
`abort()`), and active `for await` loops reject likewise. Aborting is idempotent and
a no-op on a streamie that has already drained or halted.

```ts
const items = streamie(handler, {});
items.abort(new Error('upstream connection lost'));
await items.promise; // rejects with the error
```

An abort flows downstream by the same accounting as draining: a consumer finishes
when all of its feeders have finished, and that finish is itself an abort only when
*every* feeder aborted (multiple feeders' abort errors are gathered into an
`AggregateError`). If even one feeder drained — or halted on its own handler error —
the consumer drains normally, processing whatever did arrive: one feeder of several
aborting shouldn't kill a consumer the others completed normally.

Failure also flows *upstream*: when a consumer's halt leaves a streamie with no
consumers at all, the streamie aborts with that consumer's terminating error —
every path its outputs could take has failed, so there is nothing left to produce
for. Each stage applies the same rule to its own feeders, so a failure at any depth
tears the pipeline down all the way to its source, rejecting every stage's promise
with the root error (and releasing a bridged stream's reader — see Web Streams).
Both directions keep their survival predicates, so an abort anywhere tears down
exactly the stages left with no surviving feeder or consumer path — a linear chain
dies whole, while branches still serving (or served by) a live sibling are spared. The
requirements mirror the downstream rule: a surviving sibling consumer prevents the
cascade, and voluntary detaches — a consumer draining away, an iterator `break` —
never trigger it, leaving a healthy streamie retaining outputs for the next
consumer. To exempt a deliberately long-lived source whose ephemeral consumers
come, fail, and are replaced (a hub), pass `keepAlive: true`: it retains and parks
instead, exactly as if its consumers had detached voluntarily.

## Yielding

You will almost certainly never need this. Streamie pipelines spend their lives
awaiting real asynchronous work — network, disk, timers — and every such await
returns control to the event loop naturally. This section only matters in the
degenerate case: a sink-terminated pipeline of purely synchronous handlers (or
async ones that never touch real I/O) fed by a source that never runs dry, which
could otherwise monopolize the thread — leaving timers unable to fire, including a
`setTimeout` that would have called `abort()`. (Without a sink it cannot happen at
all: output retention parks a consumer-less pipeline on backpressure.)

As an escape hatch for that case, a streamie yields to the event loop via a
macrotask whenever it has been processing continuously for more than `yieldAfter`
milliseconds (default `100`, configurable). A pipeline doing real asynchronous work
yields on its own constantly and never hits this. Note also that no scheduler can
preempt a single synchronous handler invocation — chunking a truly long computation
remains the handler's job.

## Push Receipts

`push` takes a single item, is synchronous, and returns a receipt. The receipt's
`.promise` resolves with the item's output once its handler invocation has settled:

```ts
const doubled = streamie(async (input: number) => input * 2, {});

const receipt = doubled.push(21);
await receipt.promise; // 42
```

The receipt also carries the input backpressure state the push produced. Pushes are
never refused, so this is a cooperative signal: a producer seeing `true` should pause
and resume on the `onBackpressureRelease` event.

```ts
if (doubled.push(item).backpressure) {
  await new Promise<void>((resolve) => doubled.onBackpressureRelease.once(resolve));
}
```

A few behaviors worth knowing:
  - Receipt promises are created lazily, on first access. A receipt you never look at
    costs no promise allocation, and — importantly — cannot produce unhandled
    rejection warnings when the pipeline errors.
  - If an item's handler invocation throws, its receipt rejects with the same
    `StreamieQueueError` the streamie's own promise rejects with. If the streamie
    halts before a queued item is ever handled, that item's receipt rejects with the
    halting error, so awaiters are never left hanging.
  - The promise settles when the item has been *processed*, not when downstream
    consumers have taken the output — so awaiting a receipt before consuming the
    output cannot deadlock the pipeline. (Processing itself still requires
    somewhere for outputs to go: on a consumer-less non-sink streamie, items past
    the output retention threshold are not processed until a consumer attaches —
    see Sinks.)
  - A filter stage's receipt resolves with the item itself once it has been
    processed, whether or not it passed the predicate; a batch stage's receipts each
    resolve with the batch their item joined.

## Events

A streamie exposes five lifecycle events: `onBackpressureRelease`, `onDraining`,
`onDrained`, `onError`, and `onHalted`. Each is callable to attach a persistent
handler, carries `.once` for handlers that remove themselves after one invocation,
and both forms return an unsubscribe function:

```ts
const unsubscribe = s.onError((error) => log(error));
s.onDrained.once(() => console.log('done'));
unsubscribe();
```

`onDraining`, `onDrained`, and `onHalted` are one-way transitions and latch: a
handler attached after the transition has already occurred is invoked immediately,
so subscribers never need to check state first. `onBackpressureRelease` and
`onError` are recurring.

Note that a halt is not a drain: when a streamie halts on an error, `onHalted`
fires but `onDraining`/`onDrained` do not. A handler attached during an event's
firing waits for the next firing rather than being invoked by the one in flight
(except on an already-latched event, where it is invoked immediately as above).

`onHalted`'s payload reports how the halt came about:
`{ isAborted, abortError, lastError }` — `isAborted` and `abortError` describe an
`abort()`, while `lastError` is the last error thrown by the streamie's own
handlers. Both can be present: a streamie with `haltOnError: false` that encountered
a handler error and was later aborted retains each in its respective field.

There is deliberately no event for "my consumers died": that situation halts the
streamie itself (see Aborting), so `onHalted` is the notification. A stage halted
that way reports `isAborted: true` — read it as "terminated from outside its own
handlers" — with the root cause, the failed consumer's own abort error or handler
error, as its `abortError`.

## Async Iteration

Every streamie is an async iterable, so its outputs can be consumed with `for await...of`:

```ts
const doubled = streamie(async (input: number) => input * 2, {});

[1, 2, 3].forEach((item) => doubled.push(item));
doubled.drain();

for await (const item of doubled) {
  console.log(item); // 2, 4, 6
}
```

The loop ends when the streamie drains, and throws if it errors. Iteration participates
in backpressure: the streamie only runs ahead of the loop by its own bounded output
queue, so a slow consumer slows the whole pipeline rather than letting items accumulate.
Breaking out of the loop early simply detaches the iterator; the streamie continues
processing for any other consumers.

This also makes streamies consumable by anything that accepts an async iterable, e.g.
`Readable.from(myStreamie)` to bridge into a Node stream.

Two things to note: an iterator only observes items not yet delivered — with other
consumers attached, delivery is immediate, so begin iterating in the same
synchronous block as your pushes (the same contract as attaching a `.map`; outputs
retained by a previously consumer-less streamie do flush to it — see Sinks). And
multiple concurrent iterators each receive every item, since outputs are broadcast
to all consumers.

## Web Streams

WHATWG streams — the `ReadableStream`/`WritableStream` of browsers, Node (≥ 18),
Deno, and Bun, e.g. `fetch` response bodies — bridge directly in and out of a
pipeline, from the opt-in **`streamie/web`** entry:

```ts
import { fromReadableStream, toWritableStream } from 'streamie/web';

await toWritableStream(
  fromReadableStream(someReadableStream)
    .map((chunk) => transform(chunk), { concurrency: 4 }),
  someWritableStream,
);
```

The separate entry mirrors `streamie/node`, for the same reason: the core entry is
kept free of any stream type dependency, so a consumer with a bare ES `lib` (no `dom`,
no `@types/node`) can use the core with no stream types in scope. `streamie/web` types
against the real WHATWG globals (`ReadableStream<T>`, `WritableStream<T>`), so importing
it expects those types in your environment — browsers, Deno, and Bun have them via
`lib.dom`; Node has them via a recent `@types/node` or the `dom` lib. (At runtime the
globals exist on every WHATWG-stream runtime, Node ≥ 18 included, so the bridges stay as
portable as the core — the requirement is purely on the *type* environment.) Typing
against the real streams means chunk types flow by plain inference and the produced
stream is a genuine `ReadableStream<O>`.

`fromReadableStream(stream, { backpressureAt?, preventCancel? })` returns a streamie
fed by the stream, under backpressure: the stream is only pulled as fast as the
pipeline absorbs items. The stream ending drains the streamie; the stream erroring
aborts it with that error; and the streamie terminating — drained, aborted, or
halted — cancels the stream's reader.

The bridge also comes down when the pipeline it feeds fails: downstream failure
cascades upstream stage by stage (see Aborting), so a failure at *any* depth — if
`transform` above throws, or something three stages further down does — aborts the
bridge with the root error and cancels the reader. That is the source-cancellation
contract of `pipeTo`, applied across the whole chain the way it would be across
`pipeThrough` links. A consumer detaching voluntarily — draining, or breaking out
of a `for await` — never triggers this, and one consumer halting while a sibling
survives doesn't either. Pass `preventCancel: true` (mirroring `pipeTo`'s option)
to spare the stream itself: the bridge streamie still halts with its pipeline, but
the reader lock is released without cancelling, leaving the stream readable by
another consumer.

`toWritableStream(streamie, stream)` pipes a streamie's outputs into a writable with
`pipeTo`'s contract: it resolves once the streamie has drained and the sink has
closed. The sink's queuing strategy paces the pipeline (awaiting `write()` is WHATWG
backpressure), a streamie abort or halt aborts the sink with the terminating error,
and a sink failure aborts the streamie — in each failure case the returned promise
rejects with that error. As with any iteration, retained outputs from a previously
consumer-less streamie flush to it; outputs already delivered to other consumers do
not replay.

`toReadableStream(streamie, strategy?)` is the mirror of `fromReadableStream`: it
exposes a streamie's outputs *as* a `ReadableStream`, so anything that consumes web
streams — `pipeThrough`, a `Response` body — can drive a pipeline.

```ts
import { fromReadableStream, toReadableStream } from 'streamie/web';

const body = toReadableStream(
  fromReadableStream(request.body!)
    .map((chunk) => transform(chunk), { concurrency: 4 }),
);
return new Response(body);   // body is a real ReadableStream<O> — no cast
```

The stream is pull-driven, which *is* WHATWG read backpressure: it pulls one item
per read the consumer makes, so a slow reader paces the iterator, which paces the
streamie, which builds backpressure up the pipeline. The streamie draining closes the
stream; an abort or halt — including one cascaded from a failure anywhere in the
pipeline — errors it with the terminating error, surfacing to readers. Cancelling the
stream (`reader.cancel()`, or a `pipeTo` destination failing) is treated as a
*voluntary* detach, the ReadableStream equivalent of breaking a `for await`: the
streamie is unhooked as that consumer would be — a surviving sibling consumer is
unaffected, and a now-consumer-less streamie parks on its retained outputs rather than
aborting. The cancel reason is deliberately not propagated upstream as an abort, the
same way WHATWG's own `ReadableStream` from an async iterable calls `return()`, not
`throw()`. The optional `strategy` is a standard queuing strategy tuning how far the
produced stream reads ahead (default high water mark `1`). A sink (`.each`/`.sink`)
has no consumable output, so calling `toReadableStream` on one throws, the same as any
other attempt to consume a sink.

`toReadableStream` is the one bridge that *constructs* a stream, via the global
`ReadableStream` constructor — a web-platform global present in browsers, Node (≥ 18),
Deno, and Bun, so still no import and no `node:stream`. The receiving bridges
(`fromReadableStream`, `toWritableStream`) only call methods on a stream you hand
them, and release their reader/writer locks once finished with it, the same
finalization `pipeTo` performs.

Because the produced stream is a genuine `ReadableStream<O>`, DOM consumers accept it
directly — `new Response(body)`, `pipeThrough`, a `ReadableStream<O>` parameter — with
no cast. The `Stream`-suffixed names are deliberate: bare `Readable`/`Writable` are
Node's stream classes, whose bridges live in `streamie/node` (see Node Streams);
`node:stream` never touches this entry, nor it `streamie/web`.

## Node Streams

Node's object-mode streams — `Readable`/`Writable` from `node:stream` — bridge the
same way, but from a **separate entry point**, `streamie/node`:

```ts
import streamie from 'streamie';
import { fromReadable, toReadable, toWritable } from 'streamie/node';
```

The split is deliberate and the reason the import path differs: `node:stream` is a
Node-only dependency, and the core entry depends on no stream environment at all.
Nothing in `streamie/node` is reachable from the core, so pulling `node:stream` is
opt-in, paid for only by code that imports it; a browser bundle never sees it. (The
WHATWG bridges sit behind their own `streamie/web` entry for the symmetric reason — see
Web Streams.)

The three bridges mirror their WHATWG siblings one-to-one, with the same termination
and backpressure contracts:

- **`fromReadable<T>(readable, { backpressureAt?, yieldAfter? })`** — a streamie fed by
  a Node `Readable`, under backpressure: the stream is only consumed as fast as the
  pipeline absorbs items. The stream ending drains the streamie; the stream erroring
  aborts it with that error; and the streamie terminating — drained, aborted, or
  halted, including a halt cascaded from a failure anywhere downstream — destroys the
  stream. Because a `Readable` isn't generic over what it yields, name the chunk type
  yourself (`fromReadable<Buffer>(req)`); it defaults to `unknown`. Teardown always
  `destroy()`s the source (error-free, so it raises no spurious `'error'`); there is no
  `preventCancel` equivalent — the WHATWG-only escape hatch for leaving a shared stream
  readable by another consumer — so don't hand `fromReadable` a `Readable` you intend
  to keep reading elsewhere afterward.
- **`toWritable(streamie, writable)`** — pipes a streamie's outputs into a Node
  `Writable`, resolving once the streamie has drained and the sink has finished.
  `write()`'s return value paces the pipeline (Node write backpressure); a streamie
  abort or halt destroys the sink with the terminating error, and a sink failure
  aborts the streamie — in each case the returned promise rejects with that error.
- **`toReadable(streamie, options?)`** — the mirror of `fromReadable`: exposes a
  streamie's outputs *as* a Node `Readable` (object mode by default), pull-driven so
  the consumer's reads pace the pipeline. The streamie draining ends the stream; an
  abort or halt errors it; destroying the stream detaches it from the streamie as a
  *voluntary* departure (a surviving sibling consumer is unaffected, and a now
  consumer-less streamie parks on its retained outputs), the same as breaking a
  `for await`. `options` are standard Node `ReadableOptions`; the `highWaterMark`
  defaults to `1` (mirroring `toReadableStream`, not Node's object-mode default of 16),
  so the produced stream reads exactly one item ahead of a slow consumer rather than
  buffering 16 — pass a larger `highWaterMark` for looser read-ahead. Pass
  `objectMode: false` for a byte stream whose outputs are already
  `Buffer`/`Uint8Array`/`string`; in byte mode the bridge leaves `highWaterMark`
  untouched, but note that `Readable.from` itself defaults it to `1` (one pull per read,
  not the 64 KB of `new Readable()`), so set it explicitly (e.g. `65536`) if you want a
  real byte buffer.

```ts
import { createReadStream, createWriteStream } from 'node:fs';
import { fromReadable, toWritable } from 'streamie/node';

await toWritable(
  fromReadable<Buffer>(createReadStream('in.ndjson'))
    .map((chunk) => transform(chunk), { concurrency: 8 }),
  createWriteStream('out.ndjson'),
);
```

These are implemented natively rather than by converting through the WHATWG bridges
(`Readable.toWeb`/`fromWeb`): the adapters are still experimental in Node and would
interpose a second stream object — an extra queue and backpressure handshake per
chunk — between the node stream and the pipeline. If you'd rather route through the
web bridges anyway, you can: `fromReadableStream(Readable.toWeb(nodeReadable))` and the
like work, at that cost.

These type their streams against `@types/node`, just as `streamie/web` types against the
WHATWG globals: each opt-in entry assumes its own stream type environment, which is
exactly what keeps the core entry free of both.

## Typescript

Because batching and flattening are pipeline stages rather than config flags, the item
type at every point in a chain is concrete and inference flows through `.map`, `.filter`,
`.batch`, and `.flatten` without annotations. If you do need to specify types explicitly,
the generics are simply the input item type and the handler return type:

```ts
streamie<number, number>(
  (input) => input * 2,
  {}
)
.batch(2) // Streamie<number, number[]>
.map((pair) => pair[0] + pair[1]); // Streamie<number[], number>
```

`.flatten()` is only callable on a streamie whose items are arrays, and emits their
elements individually.

# Contributing
We welcome contributions! Please see our contributing guidelines for more information.

# License
MIT

<img width="450px"  src="https://i.imgur.com/Cp7IQHq.png" title="logo"/>

## Streamie: It's ex-streamie cool!

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/ralusek/streamie/blob/master/LICENSE)
[![npm version](https://img.shields.io/npm/v/streamie.svg?style=flat)](https://www.npmjs.com/package/streamie)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/ralusek/streamie/blob/master/LICENSE)

### What is a streamie?

Streamie is a TypeScript library for building async data pipelines with familiar array-style
methods. Use `.map`, `.filter`, `.batch`, `.flatten`, and `.each` on work that may arrive over
time, produce more work as it runs, or continue indefinitely. Each stage can run with its own
concurrency limit, and backpressure is built in so fast producers wait for slower consumers
instead of growing unbounded queues.

```ts
import streamie from 'streamie';

await streamie(async (page: number, { push, drain }) => {
  const { items, hasMore } = await fetchPage(page);
  hasMore ? push(page + 1) : drain();
  return items;                        // Page of records.
}, { seed: 0 })
  .flatten()                           // Individual records.
  .map(enrich, { concurrency: 8 })     // Up to 8 enrichments at a time.
  .batch(25)                           // Groups of up to 25 records.
  .each(bulkUpload, { concurrency: 4 })// Up to 4 uploads at a time.
  .promise;                            // Resolves when drained; rejects on failure.
```

### Where it fits (and where it doesn't)

Reach for Streamie when the problem is **processing data**: ETL, scraping and pagination,
job queues, fan-out/fan-in over network or disk, and streaming transforms. It is closest to
tools like Highland.js, Node object-mode streams, `p-map`, and `p-queue`, but it combines
concurrency, backpressure, batching, completion, and error handling behind one pipeline API.

It is not a reactive-programming library. If you need to compose events over time with
operators like `debounceTime`, `combineLatest`, `withLatestFrom`, `zip`, `switchMap`,
multicasting subjects, or marble tests, RxJS is the better fit. The reverse is also worth
knowing: RxJS is push-based with no real backpressure, so a fast producer feeding slow async
work buffers unboundedly, where Streamie simply stalls the producer instead.

### What you get

  - **Backpressure by default.** Bounded queues at every stage mean a slow consumer slows
    the producers feeding it. Pushes return a [receipt](#push-receipts) with the item's
    completion promise and a cooperative backpressure signal.
  - **Per-stage concurrency.** Any iterative method takes a `concurrency` to parallelize that
    stage without letting it outrun downstream work.
  - **Batching and flattening.** `.batch(n)` groups items into arrays of up to `n`;
    `.flatten()` emits the elements of array items individually. TypeScript follows those
    item-shape changes through the chain.
  - **Promise-native handlers everywhere.** A handler returning a promise is awaited before
    its item counts as processed.
  - **Clear completion and failure behavior.** Use [`drain()`](#drainingcompletionpromises)
    for graceful completion, [`abort()`](#aborting) for abnormal termination,
    [sinks](#sinks-each-sink-and-output-retention) to mark a pipeline endpoint, lifecycle
    [events](#events) for notifications, and `.promise` to await the result.
  - **Standard consumption paths.** Every streamie is an
    [async iterable](#async-iteration), and both [Web Streams](#web-streams) and
    [Node streams](#node-streams) bridge directly in and out.

# Installation
`npm install --save streamie`

# Examples

## Pagination

A handler can enqueue more work by calling `push`. This is useful for paginated APIs,
crawlers, and other sources where processing one item discovers the next one.

```ts
const paginator = streamie(async (page: number, { push }) => {
  const data = await fetchData(page);

  if (data.hasMore) {
    push(page + 1);
  }

  return data.items;
}, {});

paginator.push(0);
```

For sources like this, `seed` is often more convenient than calling `push` separately:

```ts
const paginator = streamie(async (page: number, { push }) => {
  const data = await fetchData(page);

  if (data.hasMore) {
    push(page + 1);
  }

  return data.items;
}, { seed: 0 });
```

## Flattening

If `fetchData` returns pages of items, `.flatten()` turns the stream from "pages" into
individual records:

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

Use `.each` when the handler is the endpoint of the pipeline, like `forEach` for a streamie:

```ts
items
  .each((item) => {
    return doSomethingIndividually(item);
  });
```

## Batching

`.batch(10)` groups individual items into arrays of up to 10 before passing them on. This is
useful for APIs that accept bulk writes:

```ts
items
  .batch(10)
  .each((batch) => {
    return upload10AtATime(batch);
  });
```

By default a batch stage waits for a full `n` items before emitting (a drain flushes
whatever partial batch remains — see Draining). When items arrive in bursts and you don't
want a half-full batch waiting indefinitely for the rest, pass `maxBatchWait` (milliseconds):
the stage emits the items it has once that long has elapsed since the last batch, even if
fewer than `n` have accumulated.

```ts
items
  .batch(100, { maxBatchWait: 50 }) // Up to 100 items, but never wait longer than 50ms.
  .each((batch) => {
    return bulkUpload(batch);
  });
```

## Aggregating: `.reduce` and `.scan`

`.reduce` folds the whole stream into a single value, emitted once when the stream drains —
the streaming counterpart of `Array.prototype.reduce`:

```ts
const total = items
  .reduce((acc, item) => acc + item.amount, 0)
  .each((sum) => report(sum)); // Fires once, with the final total.
```

The reducer may be async (it is awaited before its result becomes the accumulator), and the
fold is sequential regardless of any `concurrency` you set, since each step reads what the
previous one wrote. A stream that produces no items still emits the initial value, matching
`reduce`-with-seed over an empty array.

`.scan` is a running reduce: it threads the same accumulator through the stream but emits it
after *every* item, so an N-item stream yields N outputs — the running totals:

```ts
items
  .scan((acc, item) => acc + item.amount, 0)
  .each((runningTotal) => updateGauge(runningTotal));
```

An empty stream emits nothing from `.scan`.

## Producing: `.produce`

`.map` emits exactly one output per input, `.filter` zero or one, `.flatten` one per array
element. `.produce` is the general case: the handler is handed an `emit` and produces as many
(or as few) outputs as it likes — synchronously, after an `await`, or from a callback it
schedules — while its return value feeds only the push receipt. Reach for it to fan one input
out to a variable number of outputs without first materializing them into an array:

```ts
source
  .produce<string>((line, { emit }) => {
    for (const token of tokenize(line)) emit(token);
  })
  .each((token) => index(token));
```

Because TypeScript cannot read the output type out of the `emit()` calls in the body, supply
it with an explicit type argument (`.produce<Token>(…)`) or by annotating the `emit`
parameter (`(line, { emit }: Tools<string, Token>) => …`); the latter also keeps the receipt
type precise. (`.produce(handler)` is exactly `.map(handler, { automaticallyEmit: false })`,
with a name that says what it is for.)

`emit` is a stable reference you may hold and call from a scheduled callback, but only while
the stage is still running: once the stage has drained (or halted) there is nowhere left to
deliver, so an `emit` fired after completion is silently dropped rather than re-opening a
finished stage. If you schedule emits, arrange to finish them before the source drains —
typically by keeping work outstanding through a push receipt or your own pending count.

Most interesting `.produce` stages are stateful — windowing, dynamic batching, dedup,
threshold-triggered emits. There is no built-in scratchpad: a handler is a closure, so keep
the state in the surrounding scope and the stage carries it across invocations on its own:

```ts
const acc = { sum: 0 };
source
  .produce<number>((item, { emit }) => {
    acc.sum += item;
    if (acc.sum > 100) { emit(acc.sum); acc.sum = 0; } // Emit a running window, then reset.
  });
```

This deliberately keeps the state visible rather than hiding it behind the API, because shared
mutable state and `concurrency` are in tension: at `concurrency: 1` (the default) the
invocations are sequential and the accumulator is safe, but raise the concurrency and that
same `acc` is shared across in-flight invocations — which is now plainly your call to reason
about. (When the aggregation is a strict left fold, prefer `.reduce`/`.scan`, which own the
accumulator and force sequential execution for you.)

## Concurrency

Pass `concurrency` to any stage that should process more than one item at a time:

```ts
items
  .batch(10)
  .each((batch) => {
    return upload10AtATime(batch);
  }, { concurrency: 5 });
```

## Branching (fan-out)

A streamie's outputs are broadcast to every consumer it has, so attaching more than one
consumer to the same streamie fans the stream out. Each `.map`, `.filter`, `.batch`,
`.flatten`, `.each`, or `for await` you attach is a separate consumer, and every one of them
receives every item:

```ts
const records = source.flatten();

records.each((r) => index(r));      // Branch A: index every record.
records.batch(100).each(archive);   // Branch B: archive in batches of 100.
```

Each branch carries its own concurrency, batching, and backpressure independently. Branches
also interact through completion and failure: draining or breaking out of one branch simply
detaches it and leaves the others running, while a branch that *fails* propagates only if it
leaves the shared producer with no consumers at all — a surviving sibling keeps the producer
alive (see Aborting, and `keepAlive` under Configuration). Note the one shared constraint:
the producer holds its output until *every* branch is ready for the next item, so a slow
branch paces the fast ones (see Known limitations).

Fan-*in* is the inverse — feed several producers into one consumer with `registerInput`/
`registerOutput` (the same wiring the combinators use internally). The consumer drains once
all of its inputs have drained, and aborts only if all of them aborted (see Aborting).

## Draining/Completion/Promises

Call `drain()` when no more input will be added and the queued work should finish. When a
`.batch(n)` stage drains, it may emit a final batch smaller than `n`. Upstream stages drain
their downstream consumers after all queued and active work has completed.

Every streamie has a `.promise` that resolves when it fully drains and rejects when it fails.
A handler can also drain its own streamie, as in a paginator that reaches the last page:

```ts
const paginator = streamie(async (page: number, { push, drain }) => {
  const data = await fetchData(page);
  if (data.hasMore) {
    push(page + 1);
  } else drain();
  return data.items;
}, { seed: 0 });
```

Await the terminal stage's `.promise` to wait for the whole pipeline:

```ts
await paginator
  .flatten()
  .batch(10)
  .each((batch) => {
    return upload10AtATime(batch);
  }, { concurrency: 5 })
  .promise;
```

## Sinks: `.each`, `.sink()`, and output retention

By default, a streamie keeps its outputs until something consumes them. That allows a
consumer attached later to receive retained output, but it also means a pipeline with no
final consumer will eventually pause on output backpressure instead of draining, so its
`.promise` never resolves. If the end
of your pipeline is just side effects or "done means reached the end", mark it as a sink.

You have three common options:

  - `.each(handler, config?)` — a terminal `.map`, i.e. a forEach: the handler is
    the endpoint. This is the usual way to finish a pipeline of side effects.
  - `.sink(config?)` — appends an identity terminal stage, for chains of pure
    transforms where reaching the end is itself the point.
  - `{ sink: true }` — the lower-level config flag both are sugar for, for a
    standalone streamie that is itself the endpoint.

A sink discards outputs as they settle. It has no consumable output queue, so
`backpressureAt.output` has no effect on that stage, and trying to attach a consumer to it
throws. Await the sink's `.promise` for completion.

Output retention only applies when there is no current consumer, or when a consumer
detaches voluntarily, such as an iterator `break`. If a downstream consumer fails, the
failure propagates upstream instead of leaving the producer parked forever (see Aborting).

## Aborting

Draining is the graceful finish. `abort(error?)` is the immediate failure path. It abandons
queued items, rejects the streamie's promise and queued push receipts with the given error
(or a generic error for a bare `abort()`), and causes active `for await` loops to throw.
Calling `abort()` more than once is safe; it has no effect after the streamie has already
drained or halted.

```ts
const items = streamie(handler, {});
items.abort(new Error('upstream connection lost'));
await items.promise; // rejects with the error
```

Aborts propagate downstream once all inputs feeding a consumer have finished. The consumer
is considered aborted only if every feeder aborted; multiple abort reasons are gathered into
an `AggregateError`. If at least one feeder drained normally, the consumer drains normally
after processing what it received.

Failures can also propagate upstream. If a downstream consumer fails and that leaves its
producer with no remaining consumers, the producer aborts with the same root error. In a
linear pipeline, that means a failure usually tears down the whole chain and rejects each
stage's `.promise`. In a branched pipeline, a surviving sibling consumer prevents the shared
producer from being aborted.

Voluntary detaches do not count as failures. Breaking out of `for await`, draining a
consumer, or cancelling a readable bridge detaches that consumer and leaves the producer
available for any remaining or future consumers. For a long-lived hub where consumers may
come and go after failures, pass `keepAlive: true`; it keeps the producer alive and lets it
park on retained output instead of aborting when a consumer fails.

## Yielding

Most pipelines do not need any scheduler tuning. If handlers await network, disk, timers, or
other real async work, they naturally give the event loop time to run.

`yieldAfter` exists for a narrower case: a sink-terminated pipeline of synchronous handlers,
fed continuously, could otherwise run for a long time without letting timers fire. Streamie
yields through a macrotask after `yieldAfter` milliseconds of continuous processing
(default `100`). A single long synchronous handler still cannot be preempted; split that
work inside the handler if needed.

## Pausing

`pause()` temporarily stops a streamie from handling new input. In-flight invocations run to
completion, but nothing new is dequeued until you resume; meanwhile its input queue keeps
accepting items, so backpressure builds and propagates upstream exactly as if the stage were
busy. Call `pause(false)` (or `pause()` again — with no argument it toggles) to resume.

```ts
s.pause();        // Stop handling new input.
s.pause(true);    // Explicitly pause (idempotent).
s.pause(false);   // Resume.
```

Unlike `drain()`, a pause is not a completion signal and does not settle `.promise`; it is
purely a throttle you control. `state.isPaused` reports the current setting.

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

There is no separate event for "my consumers died". If that situation halts the streamie
itself (see Aborting), `onHalted` is the notification. A stage halted that way reports
`isAborted: true` — read it as "terminated from outside its own handlers" — with the root
cause, the failed consumer's own abort error or handler error, as its `abortError`.

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

Import Web Stream helpers from `streamie/web`. The core `streamie` import does not require
DOM or Node stream types; this entry does. Browsers, Deno, and Bun usually get those types
from `lib.dom`; Node projects can use a recent `@types/node` or include the DOM lib. At
runtime, the helpers use standard WHATWG streams, including Node's built-in Web Streams in
Node 18 and later.

`fromReadableStream(stream, { backpressureAt?, preventCancel? })` returns a streamie
fed by the stream, under backpressure: the stream is only pulled as fast as the
pipeline absorbs items. The stream ending drains the streamie; the stream erroring
aborts it with that error; and the streamie terminating — drained, aborted, or
halted — cancels the stream's reader.

If downstream work fails, the failure propagates back to the bridge (see Aborting). For
example, if `transform` throws several stages later, `fromReadableStream` aborts with that
root error and cancels the reader. Voluntary detaches, such as draining or breaking out of
`for await`, do not cancel the source. Pass `preventCancel: true` to release the reader lock
without cancelling the stream, which is useful when another consumer should be able to read
from it afterward.

`toWritableStream(streamie, stream)` pipes a streamie's outputs into a writable with
`pipeTo`'s contract: it resolves once the streamie has drained and the sink has
closed. The sink's queuing strategy paces the pipeline (awaiting `write()` is WHATWG
backpressure), a streamie abort or halt aborts the sink with the terminating error,
and a sink failure aborts the streamie — in each failure case the returned promise
rejects with that error. As with any iteration, retained outputs from a previously
consumer-less streamie flush to it; outputs already delivered to other consumers do
not replay.

`toReadableStream(streamie, strategy?)` exposes a streamie's outputs *as* a
`ReadableStream`, so anything that consumes web streams — `pipeThrough`, a `Response`
body — can drive a pipeline.

```ts
import { fromReadableStream, toReadableStream } from 'streamie/web';

const body = toReadableStream(
  fromReadableStream(request.body!)
    .map((chunk) => transform(chunk), { concurrency: 4 }),
);
return new Response(body);   // body is a real ReadableStream<O> — no cast
```

The produced stream is pull-driven: each read pulls one item, so a slow reader paces the
pipeline. When the streamie drains, the `ReadableStream` closes. If the streamie aborts or
halts, the `ReadableStream` errors with the terminating error. Cancelling the
`ReadableStream` (`reader.cancel()`, or a failed `pipeTo` destination) detaches that
consumer from the streamie like breaking a `for await`; it does not abort upstream work by
itself. The optional `strategy` is a standard queuing strategy for controlling read-ahead
(default high water mark `1`). A sink (`.each`/`.sink`) has no consumable output, so calling
`toReadableStream` on one throws.

`toReadableStream` returns a real `ReadableStream<O>`, so DOM consumers accept it directly:
`new Response(body)`, `pipeThrough`, or any parameter typed as `ReadableStream<O>`.
The `Stream` suffix distinguishes these helpers from the Node stream helpers in
`streamie/node`.

## Node Streams

Node's `Readable` and `Writable` streams from `node:stream` bridge through the
**`streamie/node`** entry point:

```ts
import streamie from 'streamie';
import { fromReadable, toReadable, toWritable } from 'streamie/node';
```

Use this entry in Node projects. It depends on Node's stream types; the core package does
not, and browser code should use `streamie/web` for WHATWG streams.

The three helpers have the same basic completion, failure, and backpressure behavior as the
Web Stream helpers:

- **`fromReadable<T>(readable, { backpressureAt?, yieldAfter? })`** — a streamie fed by
  a Node `Readable`, under backpressure: the stream is only consumed as fast as the
  pipeline absorbs items. The stream ending drains the streamie; the stream erroring
  aborts it with that error; and the streamie terminating destroys the source stream.
  Node `Readable` is not generic over its chunks, so provide the chunk type yourself
  (`fromReadable<Buffer>(req)`); it defaults to `unknown`. Teardown always calls
  `destroy()` on the source. There is no `preventCancel` equivalent, so do not pass a
  `Readable` you intend to keep reading elsewhere afterward.
- **`toWritable(streamie, writable)`** — pipes a streamie's outputs into a Node
  `Writable`, resolving once the streamie has drained and the sink has finished.
  `write()`'s return value paces the pipeline (Node write backpressure); a streamie
  abort or halt destroys the sink with the terminating error, and a sink failure
  aborts the streamie — in each case the returned promise rejects with that error.
- **`toReadable(streamie, options?)`** — exposes a
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

These helpers are implemented directly against Node streams. You can still convert through
WHATWG streams yourself with `Readable.toWeb`/`Readable.fromWeb` and the `streamie/web`
helpers, but that adds another stream object and another queue between the source and the
pipeline.

## Configuration

Every stage takes an optional config object as its last argument (`streamie(handler, config)`,
`.map(handler, config)`, `.batch(n, config)`, and so on). All fields are optional:

  - **`concurrency`** (default `1`) — how many items the stage handles at once. The default
    is strictly sequential; raise it to parallelize a stage without letting it outrun
    downstream work.
  - **`backpressureAt`** (default `100`) — the queue depth at which the stage reports
    backpressure. Pass a number to set both the input and output thresholds, or an object to
    set them independently: `{ input?, output? }`. When the *input* queue reaches the
    threshold, pushes start reporting `backpressure: true` (they are never refused — see Push
    Receipts) and upstream stages stop feeding it. When the *output* queue reaches it, the
    stage stops handling new input until consumers drain it. This is the bound that keeps a
    fast producer from growing an unbounded queue ahead of a slow consumer. (A sink has no
    output queue, so `backpressureAt.output` has no effect on one.)
  - **`haltOnError`** (default `true`) — whether a handler error halts the streamie and
    rejects its `.promise`. With `false`, the stage records the error (`onError` still fires,
    and the item's receipt still rejects) but keeps processing subsequent items. This setting
    is *inherited* by stages chained off the streamie unless they override it; other config is
    not inherited.
  - **`propagateErrors`** (default `true`) — whether a handler error is forwarded to
    downstream consumers (which surfaces it on their `.promise` and in their `for await`
    loops). With `false`, an error stays local to the stage that produced it.
  - **`sink`** (default `false`) — declares the stage a terminal endpoint; outputs are
    discarded as they settle and consumers cannot be attached. `.each` and `.sink()` are the
    usual way to get this — see Sinks.
  - **`keepAlive`** (default `false`) — keeps a producer alive (parking on retained output)
    when a failing consumer would otherwise leave it consumer-less, instead of aborting it.
    For long-lived hubs whose consumers come and go — see Aborting.
  - **`yieldAfter`** (default `100`) — the synchronous-pipeline yield budget in milliseconds.
    See Yielding.
  - **`maxBatchWait`** (`.batch` only) — the longest a partial batch waits before being
    emitted. See Batching.

The handler itself receives `(item, tools)`, where `tools` is `{ push, drain, index }`:
`push` enqueues more input into this same streamie (see Pagination), `drain` marks it for
graceful completion (see Draining), and `index` is the zero-based sequence number of this
invocation.

## Introspection

A streamie exposes a read-only `state` for inspecting it without driving it:

```ts
s.state.isPaused;             // From pause().
s.state.isDrained;            // Fully drained (see Draining).
s.state.isHalted;             // Halted by error or abort.
s.state.isAborted;            // Halt came from abort() (see Aborting).
s.state.batchSize;            // The configured batch size, or null when unbatched.
s.state.backpressure.input;   // Live: input queue at/over its threshold.
s.state.backpressure.output;  // Live: output queue at/over its threshold.
s.state.count.handling;       // Items currently in flight.
s.state.count.started;        // Total invocations started.
s.state.count.queued.input;   // Items waiting to be handled.
s.state.count.queued.output;  // Outputs waiting for consumers.
```

`isBatched()` is a convenience over `batchSize`: `s.isBatched()` is true when the stage was
created via `.batch` (including `.batch(1)`, which emits single-element arrays and is
observably distinct from an unbatched streamie), and `s.isBatched(n)` is true when the
configured size is exactly `n`. An unbatched streamie reports `false` for every query.

## TypeScript

Types follow the item shape through the pipeline. `.map` uses the handler return type,
`.filter` keeps the same item type, `.batch(n)` emits arrays, `.flatten()` unwraps array
items, and `.reduce`/`.scan` emit the accumulator type. Most chains infer without
annotations. `.produce` is the exception: its output type cannot be read out of the `emit()`
calls, so supply it explicitly (see Producing). If you do need to specify types explicitly,
the generics are the input item type and the handler return type:

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

## Known limitations

  - **Fan-out is paced by its slowest branch.** A producer with multiple consumers holds each
    output until *every* consumer is ready for the next item, so one slow branch slows
    delivery to the fast ones rather than each branch draining at its own rate. This keeps any
    single branch from growing an unbounded queue, but a per-consumer buffering strategy is
    not yet configurable (see Branching).
  - **No `flatMap` yet.** Map-then-flatten is expressible by composing `.map(...).flatten()`,
    but a single fused operator is not yet provided. (Aggregation is covered by `.reduce` and
    `.scan`, and arbitrary fan-out by `.produce`.)

# Migrating from 1.x

2.0 makes the item-shape combinators explicit. In 1.x, `.map` and `.filter` accepted options
that changed batching, filtering, and flattening behavior inline; in 2.0 those are no longer
accepted on `.map`/`.filter`. Call the dedicated stages in the chain instead:

  - Batching is now `.batch(n)` rather than a `batchSize` option on `.map`.
  - Filtering is now `.filter(predicate)` rather than an `isFilter` option.
  - Flattening is now `.flatten()` rather than a `flatten` option.

`.map` now always emits exactly one output per input; reach for `.filter`, `.batch`, and
`.flatten` when you need to change the item shape. The build target is `es2020`.

# Contributing

Contributions are welcome — please open an issue or pull request on
[GitHub](https://github.com/ralusek/streamie). Run `npm test`, `npm run test:types`, and
`npm run test:memory` before submitting.

# License
[MIT](./LICENSE)

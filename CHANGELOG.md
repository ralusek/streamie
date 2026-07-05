# Changelog

## 2.0.0 — 2026-07-04

2.0 rebuilds the public surface around explicit, composable stages. See
[Migrating from 1.x](README.md#migrating-from-1x) for the upgrade path.

### Breaking

- **Item-shape combinators are explicit stages.** `.map`/`.filter` no longer accept
  `batchSize`, `isFilter`, or `flatten` options; call `.batch(n)`, `.filter(predicate)`,
  and `.flatten()` in the chain instead. The conditional types that powered the old
  options (`BatchedIfConfigured` and friends) are gone — a stage is now a plain
  `Streamie<I, O>`.
- **`push` takes exactly one item and returns the input backpressure boolean**
  (`true` = backpressured — the inverse of Node's `writable.write()`). In 1.x `push`
  was variadic at runtime and returned nothing; extra arguments are now ignored, so
  push each item individually. To observe an individual item's outcome, use the new
  `push.withReceipt(item)`.
- **Event subscriptions return an unsubscribe function** and carry `.once`; in 1.x
  they returned `void` with no way to detach. `onDraining`/`onDrained`/`onHalted` now
  latch (a handler attached after the transition fires immediately), and `onHalted`
  receives a `{ isAborted, abortError, lastError }` payload.
- **A pipeline must end somewhere.** A streamie with no consumers now retains its
  outputs and parks on output backpressure rather than discarding them; terminal
  stages are declared with `.each(handler)`, `.sink()`, or `{ sink: true }`.
- **Packaging.** Dual ESM/CJS build with an `exports` map and opt-in `streamie/web`
  and `streamie/node` entries. The build target is `es2022`; Node >= 18 is required.
  License changed from ISC to MIT.

### Added

- **Sources and collection**: `from(iterable)` feeds a pipeline from any (async)
  iterable under backpressure; `merge(sources)` fans several streamies into one;
  `.toArray()` collects the outputs; every streamie is an async iterable
  (`for await...of`).
- **Combinators**: `.each`, `.sink()`, `.flatMap`, `.take(n)`, `.until(predicate)`,
  `.produce`, `.reduce`, `.scan`, plus `.batch`/`.flatten`/`.filter` as dedicated
  stages and the `isBatched()` introspection helper.
- **Push receipts**: `push.withReceipt(item)` returns `{ backpressure, promise }`,
  the promise resolving with that item's handler-return value (created lazily, so
  unobserved receipts cost no promise and produce no unhandled rejections).
- **Termination**: `abort(error?)` for abnormal termination. Failure now propagates
  both ways — an abort cascades downstream once every feeder terminated, and a failed
  consumer that leaves a producer consumer-less aborts it (opt out with `keepAlive`
  for long-lived hubs). Voluntary detaches (drain, iterator `break`) never tear down
  the producer.
- **Decoupled output**: `automaticallyEmit: false` (or its named form `.produce`)
  hands the handler `tools.emit` to produce zero or more outputs per input,
  independent of its return value.
- **Config**: per-stage `retry` (count or `{ attempts, delay }` with backoff
  function), `timeout`, `seed`, `sink`, `keepAlive`, and `yieldAfter` (event-loop
  yield budget for fully synchronous pipelines).
- **Stream bridges**: `streamie/web` (`fromReadableStream`, `toReadableStream`,
  `toWritableStream`) and `streamie/node` (`fromReadable`, `toReadable`,
  `toWritable`), all backpressure-aware in both directions.
- **Introspection**: `state.isAborted` and `state.batchSize`.

### Changed

- Input and output queues are ring buffers (array `shift` reindexes every remaining
  element, which goes quadratic on deep queues), synchronous handlers stay on a
  promise-free fast path, and receipts/promises are allocated lazily — large
  pipelines are substantially faster and quieter on memory.
- Subscribing the same handler function to an event twice now registers two
  independent subscriptions (`EventEmitter` semantics); previously the second
  subscription was silently deduplicated.
- `maxBatchWait` is measured from when the partial batch began accumulating rather
  than from the last handler invocation, so the first batch gets a working window and
  idle gaps between batches don't count against newly arrived items.
- A handler error rejects the queued items' receipts and, under `haltOnError`,
  releases the abandoned queue instead of pinning it in memory.

---

Releases before 2.0.0 predate this changelog.

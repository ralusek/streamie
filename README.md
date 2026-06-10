<img width="450px"  src="https://i.imgur.com/Cp7IQHq.png" title="logo"/>

## Streamie: It's ex-streamie cool!

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/ralusek/streamie/blob/master/LICENSE)
[![npm version](https://img.shields.io/npm/v/streamie.svg?style=flat)](https://www.npmjs.com/package/streamie)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/ralusek/streamie/blob/master/LICENSE)

### What is a streamie?

A streamie is an alternative to promises, streams, async iterators, arrays, and reactive observables like rxJS or Highland.
It provides a wide array of features like pagination, mapping, filtering, batching, flattening, and concurrency control.

### Why should I use a streamie?

Because it's the simplest and most familiar interface for common but complex behaviors on indefinite data.

A `streamie` has useful iterator methods like `.map`, `.filter`, and `.push` on an infinite, asynchronous collection. All handler functions in these iterators are themselves asynchronous, so promises returned in them will be awaited for the item to have been considered processed and the queue to progress.

A `streamie` offers an extremely simple interface for modifying control flow through various asynchronous activities, notably:
  - `concurrency`: for any iterative method, a `concurrency` can be specified to parallelize that asynchronous action
  - `batching`/`flattening`: `.batch(n)` groups stream items into arrays of up to `n` before passing them on, and `.flatten()` does the opposite, emitting the elements of array items individually. Because these are pipeline stages rather than config flags, the item type at any point in a chain is always plain and inference just flows.
  - `backpressure`: backpressure is **automatically** handled so that asynchronous tasks at different points in the pipeline cannot iterate beyond what its outputs are capable of handling.

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

Now's let's do an example of handling them individually

```ts
items
.map((item) => {
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
.map((batch) => {
  return upload10AtATime(batch);
});
```

## Concurrency

Well what if this API let us do that, and said we could upload 10 in a single request, and perform
5 of those requests simultaneously?

```ts
items
.batch(10)
.map((batch) => {
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
.map((batch) => {
  return upload10AtATime(batch);
}, { concurrency: 5 })
.promise;

// Here, the process is complete.
```

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
  await new Promise<void>((resolve) => doubled.onBackpressureRelease(resolve));
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
    output cannot deadlock the pipeline.
  - A filter stage's receipt resolves with the item itself once it has been
    processed, whether or not it passed the predicate; a batch stage's receipts each
    resolve with the batch their item joined.

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

Two things to note: an iterator only observes items processed after it was created, so
begin iterating in the same synchronous block as your pushes (the same contract as
attaching a `.map`), and multiple concurrent iterators each receive every item, since
outputs are broadcast to all consumers.

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

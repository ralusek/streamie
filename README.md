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

1.) A `streamie` has useful iterator methods like `.map`, `.filter`, and `.push` on an infinite, asynchronous collection. All handler functions in these iterators are themselves asynchronous, so promises returned in them will be awaited for the item to have been considered processed and the queue to progress.

2.) A `streamie` offers an extremely simple interface for modifying control flow through various asynchronous activities, notably:
  - `concurrency`: for any iterative method, a `concurrency` can be specified to parallelize that asynchronous action
  - `batching`/`flattening`: for any iterative method, a `batchSize` can be specified to allow a batching of inputs up to this count before executing the iterator method. Likewise a `flatten`: `true` may be specified to flatten the input of the an iterator method.
  - `backpressure`: backpressure is **automatically** handled so that asynchronous tasks at different points in the pipeline cannot iterate beyond what its outputs are capable of handling.

3.) Fully typed in TypeScript with inference in most cases.

Seriously, check out this interface.

# Installation
`npm install --save streamie`

# Examples

## Pagination
```ts
const paginator = streamie(async (page: number, { self }) => {
  // Fetch data from an API or other source.
  const data = await fetchData(page);
  // If there's more data, push a new item into the streamie queue for handling.
  if (data.hasMore) {
    self.push(page + 1);
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
const paginator = streamie(async (page: number, { self }) => {
  // Fetch data from an API or other source.
  const data = await fetchData(page);
  // If there's more data, push a new item into the streamie queue for handling.
  if (data.hasMore) {
    self.push(page + 1);
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
const paginator = streamie(async (page: number, { self }) => {
  const data = await fetchData(page);
  if (data.hasMore) {
    self.push(page + 1);
  }
  return data.items;
}, { seed: 0, flatten: true });
```

Now's let's do an example of handling them individually

```ts
paginator
.map((item: Item) => {
  return doSomethingIndividually(item);
}, {});
```

## Batching

Or we can go in the opposite direction, where we're then going to take these individual items
streaming out, and we have an api we can use that can accept 10 of them in a single request.
By using batchSize, anything > 1 will group up the inputs into a batch of that size prior to
calling the handler.

```ts
paginator
.map((items: Item[]) => {
  return upload10AtATime(items);
}, { batchSize: 10 });
```

## Concurrency

Well what if this API let us do that, and said we could upload 10 in a single request, and perform
5 of those requests simultaneously?

```ts
paginator
.map((items: Item[]) => {
  return upload10AtATime(items);
}, { batchSize: 10, concurrency: 5 });
```

## Draining/Completion/Promises

And what happens when we're done? Well, you can call `streamie.drain()` to drain the remainder of the items.
If a batchSize is in effect, the final batch during draining is allowed to be less than that number in order
to fully drain. Upstream streamies will signal to downstream ones to drain when all of their inputs have
drained.

Every streamie returns a promise that will be resolved upon being fully drained. A streamie's handler can also
drain itself, such as the case with our paginator:

```ts
const paginator = streamie(async (page: number, { self }) => {
  const data = await fetchData(page);
  if (data.hasMore) {
    self.push(page + 1);
  } else self.drain();
  return data.items;
}, { seed: 0, flatten: true });
```

And to mark the process complete with the promise, here's the whole thing:

```ts
await paginator
.map((items: Item[]) => {
  return upload10AtATime(items);
}, { batchSize: 10, concurrency: 5 })
.promise;

// Here, the process is complete.
```

## Typescript

In most cases, the types can be inferred, however, if you have certain combinations of
modifiers, Typescript struggles to infer correctly. The generics have a simple interface
for specifying the input queue item type and the output item queue type, as well as the
config object.

The generics are specified like this:
```ts
streamie<number, number[], { batchSize: 2}>(
  (inputs: number[]) => inputs.map(input => input * 2),
  { batchSize: 2 }
);
```

# Contributing
We welcome contributions! Please see our contributing guidelines for more information.

# License
MIT

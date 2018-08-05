<img width="450px"  src="https://i.imgur.com/Cp7IQHq.png" title="logo"/>

## Streamie: It's ex-streamie cool!

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/ralusek/streamie/blob/master/LICENSE)
[![npm version](https://img.shields.io/npm/v/streamie.svg?style=flat)](https://www.npmjs.com/package/streamie)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/ralusek/streamie/blob/master/LICENSE)

### What is a streamie?

A streamie is an alternative to promises, streams, async iterators, arrays, and reactive observables like rxJS or Highland.

### Why should I use a streamie?

1.) A `streamie` has useful iterator methods like `.map`, `.flatMap`, `.reduce`, `.filter`, `.find`, `.push`, and `.concat` on an infinite, asynchronous collection. All handler functions in these iterators are themselves asynchronous, so promises returned in them will be awaited for the item to have been considered processed and the queue to progress.

2.) A `streamie` generates many useful metrics while running to indicate, for example, how many items are being processed per second, or the average time taken to handle an item.

3.) A `streamie` offers an extremely simple interface for modifying control flow through various asynchronous activities, notably:
  - `concurrency`: for any iterative method, a `concurrency` can be specified to parallelize that asynchronous action
  - `batching`/`flattening`: for any iterative method, a `batchSize` can be specified to allow a batching of inputs up to this count before executing the iterator method. Likewise a `flatten`: `true` may be specified to flatten the input of the an iterator method.
  - `backpressure`: backpressure is **automatically** handled so that asynchronous tasks at different points in the pipeline cannot iterate beyond what its outputs are capable of handling.

4.) A `streamie` plays nicely with many other similar utilities, such as promises and streams. It can be outputted as a promise, or have a stream inputted or outputted.


### Live Demo:
https://codesandbox.io/s/9j8y4mm1z4


### How do I use streamie?

`$ npm install --save streamie`

Assume we have the following asynchronous actions:

```js
// Gets 500 company names from a list of public companies.
// Returns format array of strings.
getCompanyNames({page: 1});
```

```js
// Accepts up to 5 company names and returns company stock prices.
// Returns format array of `{name, price}`
getCompanyStockPrices(['Apple', 'Google', 'Facebook', 'Tesla', 'Microsoft']);
```

```js
// Saves up to 30 companies stock prices in our database.
bulkSaveCompanyStocks([{name: 'Apple', price: 5}, {name: 'Google', price: 6}]);
```

We want to pull the company names, get the stock prices, and save all of the companies with a price greater than "5" to our db.

Some considerations are:

- `getCompanyNames` can handle 3 concurrent requests, each returning a batch 500 items
- `getCompanyStockPrices` can handle 20 concurrent requests, and expects up 5 items at once in a given call
- `bulkSaveCompanyStocks` can handle 10 concurrent requests, and expects up to 30 items at once in a given call

Using `streamie`, defining this job is this simple:

```js
// Returns a streamie that outputs individual company names as they're loaded.
getAllCompanyNames()
// Batches 5 items before calling handler, calls 20 handlers concurrently
.map(names => getCompanyStockPrices(names), {concurrency: 20, batch: 5})
// Flattens out the array input so that the handler is called for the individual items.
.filter(({price}) => price > 5, {flatten: true})
.map(stocks => bulkSaveCompanyStocks(stocks), {concurrency: 10, batch: 30});
```

Easy!


Now let's define `getAllCompanyNames` to load all of the company names and output them individually:


```js
const { source } = require('streamie');

function getAllCompanyNames() {
  // The `source` method is the easiest way to create a streamie.
  // Here we pass it a `handler` function, whose first argument is what is pushed
  // into the streamie using `.push()` on the streamie. `undefined` is pushed in
  // automaticaly to kickstart the process, so we default to a value of 1 in order
  // to load the first page.

  // The `streamie` passed in the second argument is this instance, and can be used to
  // `push` new items to be handled, in this case, the next page.
  return source((page = 1, { streamie }) => {
    return getCompanyNames({page})
    .then(results => {
      if (results.length) streamie.push(page + 1); // If there were results, we'll query for the next set
      else streamie.complete(); // If there were no results, we'll indicate that the streamie is done.
      return results;
    });
  })
  // Flatten the array results so that we are outputting individual company names.
  .flatMap();
}
```

<img width="450px"  src="https://i.imgur.com/Cp7IQHq.png" title="logo"/>

## Streamie: It's ex-streamie cool!

### What is a streamie?

A streamie is an alternative to promises, streams, async iterators, arrays, and reactive observables like rxJS.

### Why should I use a streamie?
Three reasons:

1.) A `streamie` has useful iterator methods like `.map`, `.flatMap`, `.reduce`, `.filter`, `.find`, `.push`, and `.concat` on an infinite, asynchronous collection.

2.) A `streamie` offers an extremely simple interface for modifying control flow through various asynchronous activities, notably:
  - `concurrency`: for any iterative method, a `concurrency` can be specified to parallelize that asynchronous action
  - `batching`/`flattening`: for any iterative method, a `batchSize` can be specified to allow a batching of inputs up to this count before executing the iterator method. Likewise a `flatten`: `true` may be specified to flatten the input of the an iterator method.
  - `backpressure`: backpressure is **automatically** handled so that asynchronous tasks at different points in the pipeline cannot iterate beyond what its outputs are capable of handling.

3.) A `streamie` plays nicely with many other similar utilities, such as promises and streams. It can be outputted as a promise, or have a stream inputted or outputted.


### How do I use streamie?

`$ npm install --save streamie`

Fundamentally, a `streamie` is an asynchronous collection of values that can be iterated on with familiar methods.

```js
const letters = new Streamie();
// Push in some values to the queue.
letters.concat(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
// Use familar iterator methods.
letters
.map(letter => letter.toUpperCase()) // Is passed every letter, capitalizes them
.filter(letter => letter !== 'C') // Is passed every capitalized letter, filters out "C"
.map(letters => letters[0] + letters[1], {batchSize: 2}) // Batches together letters in groups of 2, outputs them concatenated.
```

The methods `.map`, `.filter` here are allowing a function to be passed in as a `handler` for these values in the queue.


Where a `streamie` really shines, however, is in massive or indefinite asynchronous tasks, such as fetching paginated records, performing long running jobs, or any other iterated async operation.


### Live Demo:
https://codesandbox.io/s/9j8y4mm1z4


### Real world example

Let's say we're the NSA, and have a record in our database for every person on the planet, and we paginate through these records like this:
```js
// Surveil the first 25 suspects:
nsa.suspects.surveil({page: 1, limit: 25});

// And to get the next page of suspects, as expected, we paginate thusly:
nsa.suspects.surveil({page: 2, limit: 25});
```

There are about 7,600,000,000 probable terrorists currently alive, and if we surveil them 25 at a time, that's 304,000,000 requests to make. Because the NSA is a government institution, we don't know how to index our database, so we need to do a lot of full database scans. This is where we'll need a `streamie`.

 What we want to do with our NSA records is have a stream of `page` values for the current page we're paginating through, and define a `handler` function which performs an asynchronous fetch of records for the current value (`pageNumber`) being handled in the queue.

```js
function listEveryPersonOnThePlanet() {
  const streamie = new Streamie({
    // This handler allows us to specify a function that will be called for every item pushed into the streamie.
    // The current item in the streamie is passed in as the first argument, in this case it will be the current `pageNumber` number
    handler: (pageNumber, {streamie}) => {
      return nsa.suspects.surveil({page: pageNumber, limit: 25})
      .then((suspects = []) => {
        // If there are still terrorists we haven't surveiled, push next page number into queue.
        if (suspects.length) streamie.push(pageNumber + 1);
        // If we've looked at all of the terrorists, we complete the streamie.
        else streamie.complete();

        return suspects;
      });
    }
  });

  // We kick off the process by pushing in the first value that we want to return, `pageNumber` 1.
  streamie.push(1);

  return streamie;
}
```

Now, let's say that we want to build up some detailed profiles on some likely terrorists. Like I said before, we're the government, so we don't have any capability to perform an indexed search on our database, and we'll be performing a filter at the application level.

In our search for terrorists, let's say that we're looking for males 18 and older.

```js
listEveryPersonOnThePlanet()
.filter(person => person.sex === 'male' && person.age > 17);
```

This is a good start. Note that the `.filter` function we defined will be executed **as new records come in**. This is not a case of us fetching every person and then performing a filter after they've finished loading. Not only would that crash our application, but we wouldn't be able to continue processing any of the items as they were actually loaded.

There is a problem with our code, though, which is that the `handler` from our `listEveryPersonOnThePlanet` function returns `suspects`, an **array** of people at a time. Fortunately, because `streamie` was built in the private sector, it has a way for us to transform this output so that a single person gets passed in at a time.

```js
listEveryPersonOnThePlanet()
// `.listEveryPersonOnThePlanet` output of an array of suspects is flattened to a single person at a time by providing flatten: true
.filter(person => person.sex === 'male' && person.age > 17, {flatten: true});
```

The second argument to the `filter` object is the `configuration` object. This is available on all of the async iterator methods, such as `.map`, `.filter`, `.find`, and `.reduce`. Here, we've passed in the `flatten` property to indicate that we want the input to this iterator to be flattened.

The next thing we'll want to do with our terrorists is retrieve a detailed dossier for each of them. We have a method to do this retrieval that we can call in the following fashion:

```js
nsa.suspects.retrieveDossiers([person1.id, person2.id, person3.id]);
```

You'll notice that we are expected to pass in an **array** of person ids to this method. The reason this works this way is because what happens when we call this function is that an NSA government bureacrat receives a phone call, and they telegraph the pentagon, where somebody gets up and pulls out a physical dossier on a terrorist. They then take a picture of the documents on a government camera that was built in the 70s for 3 billion dollars, have the pictures processed in a darkroom by a man with the highest possible security clearance, who then sends the processed photographs in a pneumatic tube back to the NSA, where a clerk transcribes the text from the photo and responds to the api call. Naturally, this whole process takes quite a bit of time, so it's much easier for us to send up a batch of around 100 people at a time so that multiple dossiers can be processed simultaneously.

So for this next call, we'll want to perform effectively the opposite of the `flatten` we did in the previous step, and instead provide a `batchSize` of `100` to allow the filtered people to pool together for the next api call.

```js
listEveryPersonOnThePlanet()
.filter(person => person.sex === 'male' && person.age > 17, {flatten: true})
// `.filter` output of individual person are combined into batch of 100 people by providing batchSize: 100
.map(people => nsa.suspects.retrieveDossiers(people), {batchSize: 100});
```

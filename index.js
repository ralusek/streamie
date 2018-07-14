'use strict';

const EventEmitter = require('events');
const Stream = require('stream');

const utils = require('./utils');


// This establishes a private namespace.
const namespace = new WeakMap();
function p(object) {
  if (!namespace.has(object)) namespace.set(object, {});
  return namespace.get(object);
}


/**
 *
 */
class Streamie {
  constructor(config = {}) {
    
    p(this).name = config.name;

    // Handle configuration.
    p(this).config = {};

    p(this).config.autoAdvance = true;
    p(this).config.batchSize = config.batchSize || 1;
    p(this).config.concurrency = config.concurrency || 1;
    p(this).config.stopAfter = config.stopAfter;

    // If this is specified, this function will be passed the result of the handler
    // function, and if true, will have the corresponding streamInput pushed into
    // the output stream, rather than the result itself. Comparable to the way
    // that Array.filter functions.
    p(this).config.filterTest = config.filterTest;


    p(this).stream = new Stream.Transform({
      objectMode: true,
      highWaterMark: p(this).config.concurrency,
      transform: (input, encoding, callback) => _handleStreamInput(this, input, callback)
    });
    p(this).stream.resume(); // Set the stream to be readable.

    p(this).children = []; // Children Streamies

    p(this).queues = {
      backlogged: [],
      advanced: [], // Holds items ready to be handled
      active: [], // Holds active batch, both handling and handled, but not yet outputted
    };

    p(this).sets = {
      handling: new Set()
    }

    p(this).handler = config.handler || (item => item);

    p(this).emitter = new EventEmitter();

    // Bootstrap state.
    p(this).state = {
      stopped: false,
      count: { 
        total: 0,
        batches: 0,
        filteredThrough: 0
      }
    };
  }

  /**
   *
   */
  on(event, callback) {
    return p(this).emitter.on(event, callback);
  }

  /**
   *
   */
  push(input) {
    p(this).stream.write(input);
    return this;
  }

  /**
   *
   */
  concat(inputs) {
    inputs.forEach(input => this.push(input));
    return this;
  }

  /**
   *
   */
  stop({propagate = true} = {}) {
    if (p(this).state.stopped) return this;
    p(this).state.stopped = true;

    p(this).emitter.emit('stop', {name: p(this).name, propagate});

    // Defer execution to next tick prevent "write after end" error on stream.
    setTimeout(() => p(this).stream.destroy());

    return this;
  }

  /**
   *
   */
  advance() {
    return _advance(this);
  }

  /**
   *
   */
  pipeIn(stream) {
    stream.pipe(p(this).stream);
  }

  /**
   *
   */
  pipeOut(stream) {
    p(this).stream.pipe(stream);
  }

  /**
   *
   */
  map(handler, config = {}) {
    return _childStream(this, Object.assign(config, {handler}));
  }

  /**
   *
   */
  filter(handler, config = {}) {
    return _childStream(this, Object.assign(config, {handler, filterTest: test => !!test}));
  }

  /**
   *
   */
  find(handler, config = {}) {
    return _childStream(this, Object.assign(
      config,
      {
        handler,
        filterTest: test => !!test,
        stopAfter: config.count || 1
      }
    ));
  }
}

/**
 *
 */
function _advance(streamie) {

  const advancedItem = Object.assign(
    utils.promise.deferred(),
    {advancedAt: Date.now()
  });
  p(streamie).queues.advanced.push(advancedItem);

  _refresh(streamie);

  return advancedItem.promise;
}

/**
 *
 */
function _refresh(streamie) {
  if (p(streamie).state.stopped) return;

  const { advanced, backlogged } = p(streamie).queues;
  const { handling } = p(streamie).sets;

  // Ensure that streamie is not already handling at capacity.
  if (handling.size >= p(streamie).config.concurrency) return;

  // Ensure that an item has been advanced, or advance an item automatically if
  // configured to do so.
  if (!advanced.length) {
    if (!p(streamie).config.autoAdvance) return;
    _advance(streamie);
    return;
  }

  // Ensure that an item has been backlogged in the stream.
  if (!backlogged.length) return;

  _handleNext(streamie);
}


/**
 *
 */
function _handleNext(streamie) {
  const { advanced, backlogged, active } = p(streamie).queues;
  const { handling } = p(streamie).sets;
  const { batchSize } = p(streamie).config;

  const queueItem = Object.assign({}, advanced.shift(), backlogged.shift(), {activeAt: Date.now()});

  active.push(queueItem);


  // If not yet at batchSize, return and invoke streamCallback to allow next item.
  if (active.length < batchSize) return queueItem.streamCallback();

  // In case the batch size has changed to something smaller than what is currently
  // handled, we slice the batch out of the active array and leave the remaining
  // items in the active queue.
  const batch = active.slice(0, batchSize);
  p(streamie).queues.active = active.slice(batchSize);

  const inputs = batch.map(queueItem => {
    queueItem.handlingAt = Date.now();
    return queueItem.streamInput;
  });

  handling.add(batch);

  // Before handling, invoke streamCallback to allow next item.
  queueItem.streamCallback();

  return Promise.resolve(p(streamie).handler(
    batchSize === 1 ? inputs[0] : inputs,
    {batchNumber: ++p(streamie).state.count.batches}
  ))
  .then(response => _handleResolution(streamie, batch, null, response))
  .catch(err => _handleResolution(streamie, batch, err))
  .then(() => _refresh(streamie));
}


/**
 *
 */
function _handleResolution(streamie, batch, error, result) {
  const { handling } = p(streamie).sets;

  const { batchSize, stopAfter, filterTest } = p(streamie).config;

  // TODO determine if there is a worthwhile distinction to allowing this to drain.
  if (p(streamie).state.stopped) return;

  if (error) {
    console.log('ERROR', error);
    // TODO handle.
    return;
  }

  handling.delete(batch);
  batch.resolvedAt = Date.now();

  // Resolve _advance promises.
  batch.forEach(batchItem => batchItem.deferred.resolve(batchItem.result));

  if (filterTest) {
    if (!filterTest(result)) return;
    // Push the stream input associated with this result to the output stream.
    const inputs = batch.map(({streamInput}) => streamInput);
    p(streamie).stream.push(batchSize === 1 ? inputs[0] : inputs);

    // If stopAfter is specified, will stop if filtered count matches.
    return (++p(streamie).state.count.filteredThrough === stopAfter) && streamie.stop();
  }

  // Push the result to the output stream.
  p(streamie).stream.push(result);
}


/**
 *
 */
function _childStream(streamie, config = {}) {
  if (p(streamie).state.stopped) throw new Error(`Cannot add childStream to Streamie, Streamie has already been stopped.`);

  const childStream = new Streamie(Object.assign(
    {},
    config
  ));

  if (config.flatten) {
    const flattenStream = new Stream.Transform({
      objectMode: true,
      highWaterMark: config.concurrency || 1,
      transform: (input = [], encoding, callback) => {
        input.forEach(item => flattenStream.push(item));
        callback();
      }
    });

    childStream.pipeIn(p(streamie).stream.pipe(flattenStream));
  }
  else childStream.pipeIn(p(streamie).stream);

  p(streamie).children.push(childStream);

  // If childStream stops, called with "propagate," and this Streamie has no
  // other children, we stop it as well.
  childStream.on('stop', ({propagate}) => {
    if (!propagate) return;
    if (p(streamie).children.length > 1) return;
    streamie.stop({propagate})
  });

  return childStream;
}



/**
 *
 */
function _handleStreamInput(streamie, streamInput, streamCallback) {
  p(streamie).queues.backlogged.push({
    id: p(streamie).state.count.total++,
    streamInput,
    streamCallback,
    backloggedAt: Date.now()
  });

  _refresh(streamie);
}



module.exports = Streamie;

'use strict';

const EventEmitter = require('events');
const Stream = require('stream');

const utils = require('../utils');


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

    p(this).aggregate; // Storage property for aggregate property.

    p(this).queues = {
      backlogged: [],
      advanced: [], // Holds items ready to be handled
      active: [], // Holds active batch, both handling and handled, but not yet outputted
    };

    p(this).sets = {
      handling: new Set()
    }

    p(this).promises = {
      completed: utils.promise.deferred(),
      done: utils.promise.deferred()
    };

    p(this).handler = config.handler || (item => item);

    p(this).emitter = new EventEmitter();

    // Bootstrap state.
    p(this).state = {
      stopped: false,
      completing: false,
      completed: false,
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
    if (p(this).state.completing) throw new Error('Cannot push to streamie, already completing/completed');
    if (p(this).state.stopped) throw new Error('Cannot push to streamie, already stopped.');

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
  complete() {
    if (!p(this).state.completing) {
      p(this).state.completing = true;

      p(this).stream.cork()
    }

    _handleCompletion(this);

    return p(this).promises.completed.promise;
  }

  /**
   *
   */
  stop({propagate = true} = {}) {
    if (p(this).state.stopped) return this;
    p(this).state.stopped = true;

    p(this).emitter.emit('stop', {name: p(this).name, propagate});

    _destroyStream(this);

    p(this).promises.done.deferred.resolve();

    return this;
  }

  /**
   *
   */
  isStopped() {
    return p(this).state.stopped;
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
    return _childStreamie(this, Object.assign(config, {handler}));
  }

  /**
   *
   */
  filter(handler, config = {}) {
    return _childStreamie(this, Object.assign(config, {handler, filterTest: test => !!test}));
  }

  /**
   *
   */
  find(handler, config = {}) {
    return _childStreamie(this, Object.assign(
      config,
      {
        handler,
        filterTest: test => !!test,
        stopAfter: config.count || 1
      }
    ));
  }

  /**
   *
   */
  then(...args) {
    return p(this).promises.done.promise
    .then(...args);
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
  if (p(streamie).state.completed) return;

  const { advanced, backlogged, active } = p(streamie).queues;
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

  // Ensure that an item has been backlogged in the stream, or that the streamie
  // is in a completing state. If it is in a completing state, we proceed, as
  // we might need to drain a batch that would never finish filling out.
  _handleNextBacklogged(streamie);
  _handleCurrentBatch(streamie);
}


/**
 *
 */
function _handleNextBacklogged(streamie) {
  const { advanced, backlogged, active } = p(streamie).queues;

  if (!advanced.length || !backlogged.length) return;

  const queueItem = Object.assign({}, advanced.shift(), backlogged.shift(), {activeAt: Date.now()});

  active.push(queueItem);

  // _handleCurrentBatch(streamie);

  queueItem.streamCallback();
}


/**
 *
 */
function _handleCurrentBatch(streamie) {
  const { advanced, backlogged, active } = p(streamie).queues;
  const { handling } = p(streamie).sets;
  const { batchSize } = p(streamie).config;
  const { completing } = p(streamie).state;

  if (!active.length) return;

  const isDrainingBatch = completing && !backlogged.length;

  // Ensure that the active amount of queue items is at batchSize.
  // The exception is if streamie is currently completing, and there is nothing
  // else backlogged, in which case we handle the batch prematurely, as there
  // will be no new items processed.
  if ((active.length < batchSize) && !isDrainingBatch) return; 


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

  Promise.resolve(p(streamie).handler(
    batchSize === 1 ? inputs[0] : inputs,
    {
      batchNumber: ++p(streamie).state.count.batches,
      streamie,
      isDrainingBatch
    }
  ))
  .then(response => _handleResolution(streamie, batch, null, response))
  .catch(err => _handleResolution(streamie, batch, err))
  .then(() => {
    _handleCompletion(streamie);
    _refresh(streamie);
  });
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
function _handleCompletion(streamie) {
  const { completed, completing } = p(streamie).state;
  const { backlogged, active } = p(streamie).queues;
  const { handling } = p(streamie).sets;

  if (completed || !completing) return;
  if (backlogged.length || active.length || handling.size) return _refresh(streamie);

  p(streamie).state.completed = true;
  p(streamie).promises.completed.deferred.resolve();
  p(streamie).promises.done.deferred.resolve();
  
  _destroyStream(streamie);
  p(streamie).children.forEach(childStreamie => childStreamie.complete());
}


/**
 *
 */
function _childStreamie(streamie, config = {}) {
  if (p(streamie).state.stopped) throw new Error(`Cannot add childStreamie to Streamie, Streamie has already been stopped.`);

  const childStreamie = new Streamie(Object.assign(
    {},
    config
  ));

  if (config.flatten) {
    const flattenStream = new Stream.Transform({
      objectMode: true,
      highWaterMark: config.concurrency || 1,
      transform: (input = [], encoding, callback) => {
        if (!Array.isArray(input)) throw new Error(`Streamie cannot flatten input, expecting an array.`);
        input.forEach(item => flattenStream.push(item));
        callback();
      }
    });

    childStreamie.pipeIn(p(streamie).stream.pipe(flattenStream));
  }
  else childStreamie.pipeIn(p(streamie).stream);

  p(streamie).children.push(childStreamie);

  // If childStreamie stops, called with "propagate," and ALL of this streamie's
  // children are stopped, we stop it as well.
  childStreamie.on('stop', ({propagate}) => {
    if (!propagate) return;
    if (p(streamie).children.some(child => !child.isStopped())) return;
    streamie.stop({propagate});
  });

  return childStreamie;
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


/**
 *
 */
function _destroyStream(streamie) {
  // TODO investigate removing this, but currently here to swallow the occasional "write after end" error.
  p(streamie).stream.on('error', () => {});
  setTimeout(() => p(streamie).stream.destroy());
}



module.exports = Streamie;

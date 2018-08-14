'use strict';

const EventEmitter = require('events');
const Stream = require('stream');

const utils = require('../utils');

const functionalityTestStream = new Stream.Transform();


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

    p(this).config.throttle = config.throttle;
    p(this).config.autoAdvance = !!config.throttle || (config.autoAdvance !== false);
    p(this).config.batchSize = config.batchSize || 1;
    p(this).config.concurrency = config.concurrency || 1;
    p(this).config.stopAfter = config.stopAfter;

    // Whether to pass in the "aggregate" value to the handler. (i.e. reduce functions)
    p(this).config.useAggregate = config.useAggregate === true;

    // Whether or not the input should be passed through to the output, rather than
    // the result of the handler function. (i.e. find/filter functions)
    p(this).config.passThrough = config.passThrough || false;

    // If this is specified, this function will be passed the result of the handler
    // function, and if true, will have the corresponding streamInput pushed into
    // the output stream, rather than the result itself. Comparable to the way
    // that Array.filter functions.
    p(this).config.filterTest = config.filterTest;


    p(this).stream = _createStream(this);

    p(this).children = []; // Children Streamies

    p(this).aggregate = {}; // Storage property for aggregate property.

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

    p(this).activeTimeout = null;

    // Bootstrap state.
    p(this).state = {
      stopped: false,
      completing: false,
      completed: false,
      count: { 
        total: 0,
        batches: 0,
        batchesHandled: 0,
        itemsHandled: 0,
        filteredThrough: 0
      },
      time: {
        createdAt: Date.now(),
        avgTimeHandling: 0
      }
    };

    Object.defineProperty(this, 'metrics', {
      get() {
        const msSinceCreated = Date.now() - p(this).state.time.createdAt;
        const secondsSinceCreated = msSinceCreated / 1000;
        return {
          ...p(this).state,
          count: {...p(this).state.count},
          time: {
            ...p(this).state.time,
            msSinceCreated,
            handledPerSecond: {
              batches: p(this).state.count.batchesHandled / secondsSinceCreated,
              items: p(this).state.count.itemsHandled / secondsSinceCreated
            }
          },
        }
      }
    });
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
  complete(finalValue) {
    if (!p(this).state.completing) {
      p(this).state.completing = true;
      p(this).finalValue = finalValue;

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

    p(this).promises.done.deferred.resolve(p(this).aggregate);

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
    return this;
  }

  /**
   *
   */
  pipeOut(stream) {
    p(this).stream.pipe(stream);
    return this;
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
  flatMap(handler, config = {}) {
    return _childStreamie(this, Object.assign(config, {handler, flatten: true}));
  }

  /**
   *
   */
  reduce(handler, config = {}) {
    return _childStreamie(this, Object.assign(config, {handler, useAggregate: true}));
  }

  /**
   *
   */
  filter(handler, config = {}) {
    return _childStreamie(this, Object.assign(config, {handler, filterTest: test => !!test, passThrough: true}));
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
        stopAfter: config.count || 1,
        passThrough: true
      }
    ));
  }

  /**
   * TODO consider naming "access"
   */
  each(handler, config = {}) {
    return _childStreamie(this, Object.assign(config, {handler, passThrough: true}));
  }

  /**
   *
   */
  then(...args) {
    return p(this).promises.done.promise
    .then(...args);
  }

  /**
   * Automatically source a new streamie based off of likely args.
   */
  static source(...args) {
    let seed;
    let handler;

    let current = args.shift();
    if (Array.isArray(current)) {
      seed = current;
      current = args.shift();
    }

    if (current && (current.apply && current.call)) {
      handler = current;
      current = args.shift();
    }

    const config = current || {};
    config.handler = handler;

    const streamie = new Streamie(config);

    // Kickstart a new streamie with seed values.
    if ((seed && seed.length) || config.kickstart !== false) {
      delete config.kickstart;

      // If seed is explicitly defined, use these values.
      if (seed) streamie.concat(seed);
      // If seed is not explicitly defined, but a handler has been, push in `concurrency` amount of undefined values.
      else if (handler) {
        const amount = config.concurrency || 1;

        for (let i = 0; i < amount; i++) {
          streamie.push(undefined);
        }
      }
    }

    return streamie;
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
    if (!p(streamie).config.throttle) _advance(streamie);
    else if (!p(streamie).activeTimeout) {
      _advance(streamie);
      p(streamie).activeTimeout = setTimeout(() => {
        p(streamie).activeTimeout = null;
        _refresh(streamie);
      }, p(streamie).config.throttle);
    }
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

  setTimeout(() => queueItem.streamCallback());
}


/**
 *
 */
function _handleCurrentBatch(streamie) {
  const { advanced, backlogged, active } = p(streamie).queues;
  const { handling } = p(streamie).sets;
  const { batchSize, concurrency, useAggregate } = p(streamie).config;
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

  const inputs = batch.map(queueItem => queueItem.streamInput);

  handling.add(batch);

  const batchNumber = ++p(streamie).state.count.batches;

  const handlerArgs = [
    batchSize === 1 ? inputs[0] : inputs,
    {
      streamie,
      batchNumber,
      // Round robin integer channel assignment between 1 and (conccurency + 1)
      channel: (batchNumber % concurrency) + 1,
      isDrainingBatch
    }
  ];

  if (useAggregate) handlerArgs.unshift(p(streamie).aggregate);

  batch.handlingAt = Date.now();

  Promise.resolve(p(streamie).handler(...handlerArgs))
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

  const { batchSize, stopAfter, filterTest, useAggregate, passThrough } = p(streamie).config;

  // TODO determine if there is a worthwhile distinction to allowing this to drain.
  if (p(streamie).state.stopped) return;


  p(streamie).state.count.batchesHandled++;
  p(streamie).state.count.itemsHandled += batch.length;

  handling.delete(batch);

  _updateMetrics(streamie, batch);

  if (error) {
    console.log('ERROR', error);
    // Reject _advance promises.
    batch.forEach(batchItem => batchItem.deferred.reject(error));

    // Push emit an error from the output stream.
    p(streamie).stream.emit('error', error);

    return;
  }

  // Resolve/Reject _advance promises.
  batch.forEach(batchItem => batchItem.deferred.resolve(result));

  // If passThrough is true, we change the output to be the handler's input, rather than its
  // result. This is used for functions like .filter, .find, and .each
  let output = result;
  if (passThrough === true) {
    const inputs = batch.map(({streamInput}) => streamInput);
    output = batchSize === 1 ? inputs[0] : inputs;
  }

  // If filterTest is defined, we test the result.
  if (filterTest) {
    if (!filterTest(result)) return;
    
    p(streamie).stream.push(output);

    // If stopAfter is specified, will stop if filtered count matches.
    return (++p(streamie).state.count.filteredThrough === stopAfter) && streamie.stop();
  }

  // Push the result to the output stream.
  p(streamie).stream.push(useAggregate ? p(streamie).aggregate : output);
}


/**
 *
 */
function _updateMetrics(streamie, batch) {
  const { avgTimeHandling } = p(streamie).state.time;
  const timeHandling = Date.now() - batch.handlingAt;
  p(streamie).state.time.avgTimeHandling = utils.math.rollingAverage(timeHandling, avgTimeHandling, p(streamie).state.count.batchesHandled);
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
  const finalValue = p(streamie).finalValue !== undefined ? p(streamie).finalValue : p(streamie).aggregate;
  p(streamie).promises.completed.deferred.resolve(finalValue);
  p(streamie).promises.done.deferred.resolve(finalValue);
  
  // Signal completion to children.
  p(streamie).stream.push(null);
  _destroyStream(streamie);
  // p(streamie).children.forEach(childStreamie => childStreamie.complete());
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

  // Add support for older versions of node
  if (!p(streamie).stream.destroy) return;

  p(streamie).stream.on('error', () => {});
  setTimeout(() => p(streamie).stream.destroy());
}


/**
 *
 */
function _handleFinalStreamInput(streamie, callback) {
  streamie.complete()
  .then(() => callback && callback());
}


/**
 *
 */
function _createStream(streamie) {
  const config = {
    objectMode: true,
    highWaterMark: p(streamie).config.concurrency,
    transform: (input, encoding, callback) => _handleStreamInput(streamie, input, callback)
  };

  // Requires Node 8+
  if (functionalityTestStream.destroy) config.final = (callback) => _handleFinalStreamInput(streamie, callback);
  else config.flush = (callback) => _handleFinalStreamInput(streamie, callback);

  const stream = new Stream.Transform(config);

  stream.resume(); // Set the stream to be readable.

  return  stream;
}



module.exports = Streamie;

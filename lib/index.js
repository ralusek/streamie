'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var EventEmitter = require('events');
var Stream = require('stream');

var utils = require('./utils');

var functionalityTestStream = new Stream.Transform();

// This establishes a private namespace.
var namespace = new WeakMap();
function p(object) {
  if (!namespace.has(object)) namespace.set(object, {});
  return namespace.get(object);
}

/**
 *
 */

var Streamie = function () {
  function Streamie() {
    var config = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    _classCallCheck(this, Streamie);

    p(this).name = config.name || utils.string.generateId();

    // Handle configuration.
    p(this).config = {};

    p(this).config.throttle = config.throttle;
    p(this).config.autoAdvance = !!config.throttle || config.autoAdvance !== false;
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
      active: [] // Holds active batch, both handling and handled, but not yet outputted
    };

    p(this).sets = {
      handling: new Set()
    };

    p(this).promises = {
      completed: utils.promise.deferred(),
      done: utils.promise.deferred()
    };

    p(this).handler = config.handler || function (item) {
      return item;
    };

    p(this).errorHandlers = [];

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
      get: function get() {
        var msSinceCreated = Date.now() - p(this).state.time.createdAt;
        var secondsSinceCreated = msSinceCreated / 1000;
        return _extends({}, p(this).state, {
          count: _extends({}, p(this).state.count),
          time: _extends({}, p(this).state.time, {
            msSinceCreated: msSinceCreated,
            handledPerSecond: {
              batches: p(this).state.count.batchesHandled / secondsSinceCreated,
              items: p(this).state.count.itemsHandled / secondsSinceCreated
            }
          })
        });
      }
    });
  }

  /**
   *
   */


  _createClass(Streamie, [{
    key: 'on',
    value: function on(event, callback) {
      return p(this).emitter.on(event, callback);
    }

    /**
     *
     */

  }, {
    key: 'push',
    value: function push(input) {
      if (p(this).state.completing) throw new Error('Cannot push to streamie, already completing/completed');
      if (p(this).state.stopped) throw new Error('Cannot push to streamie, already stopped.');

      p(this).stream.write(input);
      return this;
    }

    /**
     *
     */

  }, {
    key: 'error',
    value: function error(_error) {
      _handleError(this, _error);
      return this;
    }

    /**
     *
     */

  }, {
    key: 'concat',
    value: function concat(inputs) {
      var _this = this;

      inputs.forEach(function (input) {
        return _this.push(input);
      });
      return this;
    }

    /**
     *
     */

  }, {
    key: 'complete',
    value: function complete(finalValue) {
      if (!p(this).state.completing) {
        p(this).state.completing = true;
        p(this).finalValue = finalValue;

        p(this).stream.cork();
      }

      _handleCompletion(this);

      return p(this).promises.completed.promise;
    }

    /**
     *
     */

  }, {
    key: 'stop',
    value: function stop() {
      var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
          _ref$propagate = _ref.propagate,
          propagate = _ref$propagate === undefined ? true : _ref$propagate;

      if (p(this).state.stopped) return this;
      p(this).state.stopped = true;

      p(this).emitter.emit('stop', { name: p(this).name, propagate: propagate });

      _destroyStream(this);

      p(this).promises.done.deferred.resolve(p(this).aggregate);

      return this;
    }

    /**
     *
     */

  }, {
    key: 'isStopped',
    value: function isStopped() {
      return p(this).state.stopped;
    }

    /**
     *
     */

  }, {
    key: 'advance',
    value: function advance() {
      return _advance(this);
    }

    /**
     *
     */

  }, {
    key: 'pipeIn',
    value: function pipeIn(stream) {
      stream.pipe(p(this).stream);
      return this;
    }

    /**
     *
     */

  }, {
    key: 'pipeOut',
    value: function pipeOut(stream) {
      p(this).stream.pipe(stream);
      return this;
    }

    /**
     *
     */

  }, {
    key: 'map',
    value: function map(handler) {
      var config = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

      return _childStreamie(this, Object.assign(config, { handler: handler }));
    }

    /**
     *
     */

  }, {
    key: 'flatMap',
    value: function flatMap(handler) {
      var config = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

      return _childStreamie(this, Object.assign(config, { handler: handler, flatten: true }));
    }

    /**
     *
     */

  }, {
    key: 'reduce',
    value: function reduce(handler) {
      var config = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

      return _childStreamie(this, Object.assign(config, { handler: handler, useAggregate: true }));
    }

    /**
     *
     */

  }, {
    key: 'filter',
    value: function filter(handler) {
      var config = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

      return _childStreamie(this, Object.assign(config, { handler: handler, filterTest: function filterTest(test) {
          return !!test;
        }, passThrough: true }));
    }

    /**
     *
     */

  }, {
    key: 'find',
    value: function find(handler) {
      var config = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

      return _childStreamie(this, Object.assign(config, {
        handler: handler,
        filterTest: function filterTest(test) {
          return !!test;
        },
        stopAfter: config.count || 1,
        passThrough: true
      }));
    }

    /**
     * TODO consider naming "access"
     */

  }, {
    key: 'each',
    value: function each(handler) {
      var config = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

      return _childStreamie(this, Object.assign(config, { handler: handler, passThrough: true }));
    }

    /**
     *
     */

  }, {
    key: 'then',
    value: function then() {
      var _p$promises$done$prom;

      return (_p$promises$done$prom = p(this).promises.done.promise).then.apply(_p$promises$done$prom, arguments);
    }

    /**
     *
     */

  }, {
    key: 'snatch',
    value: function snatch(fn) {
      p(this).errorHandlers.push(fn);
      return this;
    }

    /**
     *
     */

  }, {
    key: 'stream',
    value: function stream() {
      return p(this).stream;
    }

    /**
     * Automatically source a new streamie based off of likely args.
     */

  }], [{
    key: 'source',
    value: function source() {
      var seed = void 0;
      var handler = void 0;

      for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }

      var current = args.shift();
      if (Array.isArray(current)) {
        seed = current;
        current = args.shift();
      }

      if (current && current.apply && current.call) {
        handler = current;
        current = args.shift();
      }

      var config = current || {};
      config.handler = handler;

      var streamie = new Streamie(config);

      // Kickstart a new streamie with seed values.
      if (seed && seed.length || config.kickstart !== false) {
        delete config.kickstart;

        // If seed is explicitly defined, use these values.
        if (seed) streamie.concat(seed);
        // If seed is not explicitly defined, but a handler has been, push in `concurrency` amount of undefined values.
        else if (handler) {
            var amount = config.concurrency || 1;

            for (var i = 0; i < amount; i++) {
              streamie.push(undefined);
            }
          }
      }

      return streamie;
    }
  }]);

  return Streamie;
}();

/**
 *
 */


function _advance(streamie) {

  var advancedItem = Object.assign(utils.promise.deferred(), { advancedAt: Date.now()
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

  var _p$queues = p(streamie).queues,
      advanced = _p$queues.advanced,
      backlogged = _p$queues.backlogged,
      active = _p$queues.active;
  var handling = p(streamie).sets.handling;

  // Ensure that streamie is not already handling at capacity.

  if (handling.size >= p(streamie).config.concurrency) return;

  // Ensure that an item has been advanced, or advance an item automatically if
  // configured to do so.
  if (!advanced.length) {
    if (!p(streamie).config.autoAdvance) return;
    if (!p(streamie).config.throttle) _advance(streamie);else if (!p(streamie).activeTimeout) {
      _advance(streamie);
      p(streamie).activeTimeout = setTimeout(function () {
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
  var _p$queues2 = p(streamie).queues,
      advanced = _p$queues2.advanced,
      backlogged = _p$queues2.backlogged,
      active = _p$queues2.active;


  if (!advanced.length || !backlogged.length) return;

  // Associate and "consume" an `advanced` queue item placeholder with a `backlogged` queueItem.
  var queueItem = Object.assign({}, advanced.shift(), backlogged.shift(), { activeAt: Date.now() });

  // Push the current queueItem into the active queue.
  active.push(queueItem);

  // Calling the streamCallback allows for next item to be passed into the Transform stream.
  setTimeout(function () {
    return queueItem.streamCallback();
  });
}

/**
 *
 */
function _handleCurrentBatch(streamie) {
  var _p;

  var _p$queues3 = p(streamie).queues,
      advanced = _p$queues3.advanced,
      backlogged = _p$queues3.backlogged,
      active = _p$queues3.active;
  var handling = p(streamie).sets.handling;
  var _p$config = p(streamie).config,
      batchSize = _p$config.batchSize,
      concurrency = _p$config.concurrency,
      useAggregate = _p$config.useAggregate;
  var completing = p(streamie).state.completing;


  if (!active.length) return;

  var isDrainingBatch = completing && !backlogged.length;

  // Ensure that the active amount of queue items is at batchSize.
  // The exception is if streamie is currently completing, and there is nothing
  // else backlogged, in which case we handle the batch prematurely, as there
  // will be no new items processed.
  if (active.length < batchSize && !isDrainingBatch) return;

  // In case the batch size has changed to something smaller than what is currently
  // handled, we slice the batch out of the active array and leave the remaining
  // items in the active queue.
  var batch = active.slice(0, batchSize);
  p(streamie).queues.active = active.slice(batchSize);

  var inputs = batch.map(function (queueItem) {
    return queueItem.streamInput;
  });

  handling.add(batch);

  var batchNumber = ++p(streamie).state.count.batches;

  p(streamie).currentMeta = {
    streamie: streamie,
    batchNumber: batchNumber,
    // Round robin integer channel assignment between 1 and (conccurency + 1)
    channel: batchNumber % concurrency + 1,
    isDrainingBatch: isDrainingBatch
  };

  var handlerArgs = [batchSize === 1 ? inputs[0] : inputs, _extends({}, p(streamie).currentMeta)];

  if (useAggregate) handlerArgs.unshift(p(streamie).aggregate);

  batch.handlingAt = Date.now();

  Promise.resolve((_p = p(streamie)).handler.apply(_p, handlerArgs)).then(function (response) {
    return _handleResolution(streamie, batch, null, response);
  }).catch(function (err) {
    return _handleResolution(streamie, batch, err);
  }).then(function () {
    _handleCompletion(streamie);
    _refresh(streamie);
  });
}

/**
 *
 */
function _handleResolution(streamie, batch, error, result) {
  var handling = p(streamie).sets.handling;
  var _p$config2 = p(streamie).config,
      batchSize = _p$config2.batchSize,
      stopAfter = _p$config2.stopAfter,
      filterTest = _p$config2.filterTest,
      useAggregate = _p$config2.useAggregate,
      passThrough = _p$config2.passThrough;

  // TODO determine if there is a worthwhile distinction to allowing this to drain.

  if (p(streamie).state.stopped) return;

  p(streamie).state.count.batchesHandled++;
  p(streamie).state.count.itemsHandled += batch.length;

  handling.delete(batch);

  _updateMetrics(streamie, batch);

  if (error) return _handleError(streamie, error);

  // Resolve/Reject _advance promises.
  batch.forEach(function (batchItem) {
    return batchItem.deferred.resolve(result);
  });

  // If passThrough is true, we change the output to be the handler's input, rather than its
  // result. This is used for functions like .filter, .find, and .each
  var output = result;
  if (passThrough === true) {
    var inputs = batch.map(function (_ref2) {
      var streamInput = _ref2.streamInput;
      return streamInput;
    });
    output = batchSize === 1 ? inputs[0] : inputs;
  }

  // If filterTest is defined, we test the result.
  if (filterTest) {
    if (!filterTest(result)) return;

    p(streamie).stream.push(output);

    // If stopAfter is specified, will stop if filtered count matches.
    return ++p(streamie).state.count.filteredThrough === stopAfter && streamie.stop();
  }

  // Push the result to the output stream.
  p(streamie).stream.push(useAggregate ? p(streamie).aggregate : output);
}

/**
 *
 */
function _handleError(streamie, error) {
  // Reject _advance promises.
  // batch.forEach(batchItem => batchItem.deferred.reject(error));

  //
  p(streamie).children.forEach(function (childStreamie) {
    return childStreamie.error(error);
  });

  p(streamie).errorHandlers.forEach(function (errorHandler) {
    return errorHandler(error, _extends({}, p(streamie).currentMeta || {}));
  });
}

/**
 *
 */
function _updateMetrics(streamie, batch) {
  var avgTimeHandling = p(streamie).state.time.avgTimeHandling;

  var timeHandling = Date.now() - batch.handlingAt;
  p(streamie).state.time.avgTimeHandling = utils.math.rollingAverage(timeHandling, avgTimeHandling, p(streamie).state.count.batchesHandled);
}

/**
 *
 */
function _handleCompletion(streamie) {
  var _p$state = p(streamie).state,
      completed = _p$state.completed,
      completing = _p$state.completing;
  var _p$queues4 = p(streamie).queues,
      backlogged = _p$queues4.backlogged,
      active = _p$queues4.active;
  var handling = p(streamie).sets.handling;


  if (completed || !completing) return;
  if (backlogged.length || active.length || handling.size) return _refresh(streamie);

  p(streamie).state.completed = true;
  var finalValue = p(streamie).finalValue !== undefined ? p(streamie).finalValue : p(streamie).aggregate;
  p(streamie).promises.completed.deferred.resolve(finalValue);
  p(streamie).promises.done.deferred.resolve(finalValue);

  // Signal completion to children.
  p(streamie).stream.push(null);
  _destroyStream(streamie);
  p(streamie).children.forEach(function (childStreamie) {
    return childStreamie.complete(finalValue);
  });
}

/**
 *
 */
function _childStreamie(streamie) {
  var config = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

  if (p(streamie).state.stopped) throw new Error('Cannot add childStreamie to Streamie, Streamie has already been stopped.');

  var childStreamie = new Streamie(Object.assign({}, config));

  if (config.flatten) {
    var flattenStream = new Stream.Transform({
      objectMode: true,
      highWaterMark: config.concurrency || 1,
      transform: function transform() {
        var input = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
        var encoding = arguments[1];
        var callback = arguments[2];

        if (!Array.isArray(input)) throw new Error('Streamie cannot flatten input, expecting an array.');
        input.forEach(function (item) {
          return flattenStream.push(item);
        });
        callback();
      }
    });

    childStreamie.pipeIn(p(streamie).stream.pipe(flattenStream));
  } else childStreamie.pipeIn(p(streamie).stream);

  p(streamie).children.push(childStreamie);

  // If childStreamie stops, called with "propagate," and ALL of this streamie's
  // children are stopped, we stop it as well.
  childStreamie.on('stop', function (_ref3) {
    var propagate = _ref3.propagate;

    if (!propagate) return;
    if (p(streamie).children.some(function (child) {
      return !child.isStopped();
    })) return;
    streamie.stop({ propagate: propagate });
  });

  return childStreamie;
}

/**
 *
 */
function _handleStreamInput(streamie, streamInput, streamCallback) {
  p(streamie).queues.backlogged.push({
    id: p(streamie).state.count.total++,
    streamInput: streamInput,
    streamCallback: streamCallback, // This streamCallback, when called, allows the next item into the stream.
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

  p(streamie).stream.on('error', function () {});
  setTimeout(function () {
    return p(streamie).stream.destroy();
  });
}

/**
 *
 */
function _handleFinalStreamInput(streamie, callback) {
  streamie.complete().then(function () {
    return callback && callback();
  });
}

/**
 *
 */
function _createStream(streamie) {
  var config = {
    objectMode: true,
    highWaterMark: p(streamie).config.concurrency,
    transform: function transform(input, encoding, callback) {
      return _handleStreamInput(streamie, input, callback);
    }
  };

  // Requires Node 8+
  if (functionalityTestStream.destroy) config.final = function (callback) {
    return _handleFinalStreamInput(streamie, callback);
  };else config.flush = function (callback) {
    return _handleFinalStreamInput(streamie, callback);
  };

  var stream = new Stream.Transform(config);

  stream.resume(); // Set the stream to be readable.

  return stream;
}

module.exports = Streamie;
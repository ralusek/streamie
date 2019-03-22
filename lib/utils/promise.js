'use strict';

module.exports.deferred = function () {
  var deferred = void 0;
  var promise = new Promise(function (resolve, reject) {
    return deferred = { resolve: resolve, reject: reject };
  });
  return { deferred: deferred, promise: promise };
};
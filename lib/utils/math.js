'use strict';

module.exports.rollingAverage = function (value, average, itemCount) {
  return (average * (itemCount - 1) + value) / itemCount;
};
'use strict';

module.exports.rollingAverage = (value, average, itemCount) => {
  return ((average * (itemCount - 1)) + value) / (itemCount);
};

module.exports.math = {};

module.exports.math.rollingAverage = (value, average, itemCount) => {
  return ((average * (itemCount - 1)) + value) / (itemCount);
};

module.exports.promise = {};

module.exports.promise.deferred = () => {
  let deferred;
  const promise = new Promise((resolve, reject) => deferred = {resolve, reject});
  return {deferred, promise};
};

module.exports.promise = {};



module.exports.promise.deferred = () => {
  let deferred;
  const promise = new Promise((resolve, reject) => deferred = {resolve, reject});
  return {deferred, promise};
};

module.exports.promise.map = (values, fn) => {
  const len = values.length;
  return new Promise((resolve, reject) => {
    const results = [];
    let completed = 0;
    let errored = false;
    values.forEach((value, i) => {
      Promise.resolve(fn(value, i))
      .then(result => {
        results[i] = result;
        completed++;
        testForCompletion();
      })
      .catch(err => {
        errored = true;
        reject(err);
      });
    });

    testForCompletion();
    function testForCompletion() {
      if (errored) return;
      if (completed === len) resolve(results);
    }
  });
}

module.exports.promise.join = (...promises) => {
  return module.exports.promise.map(promises, promise => promise);
}

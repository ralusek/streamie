module.exports.promise = {};



module.exports.promise.deferred = () => {
  let deferred;
  const promise = new Promise((resolve, reject) => deferred = {resolve, reject});
  return {deferred, promise};
};

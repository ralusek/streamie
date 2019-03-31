/**
 * Tests if item "test" is PromiseLike.
 */
export default <T = any>(test: PromiseLike<T> | any): test is PromiseLike<T> => {
  return !!(test &&
         test.then &&
         typeof test.then === 'function');
};

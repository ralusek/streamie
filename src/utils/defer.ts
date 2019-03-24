import { PromiseResolve, PromiseReject } from '@root/types';

/**
 * Captured promise resolve and reject functions to allow for external resolution.
 */
export type Deferred<T = any, Err extends Error = Error> = {
  resolve: PromiseResolve<T>,
  reject: PromiseReject<Err>,
};

/**
 *
 */
export type DeferredWithPromise<T = any, Err extends Error = Error> = {
  deferred: Deferred<T, Err>,
  promise: Promise<T>,
};

/**
 * Defer promise.
 */
export const defer = <T = any, Err extends Error = Error>(): DeferredWithPromise<T, Err> => {
  const deferredWithPromise: any = {};

  deferredWithPromise.promise = new Promise<T>((resolve: PromiseResolve<T>, reject: PromiseReject<Err>) => {
    const deferred: Deferred<T, Err> = { resolve, reject };
    deferredWithPromise.deferred = deferred;
  });

  return deferredWithPromise;
};

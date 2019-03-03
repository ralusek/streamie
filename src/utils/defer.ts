import { PromiseResolve, PromiseReject } from "@root/types";

/**
 * Captured promise resolve and reject functions to allow for external resolution.
 */
export type Deferred = {
  resolve: PromiseResolve,
  reject: PromiseReject,
};

/**
 *
 */
export type DeferredWithPromise = {
  deferred: Deferred,
  promise: Promise<any>
};

/**
 * Defer promise.
 */
export const defer = (): DeferredWithPromise => {
  let deferred: Deferred;

  const promise = new Promise((resolve, reject) => {
    deferred = { resolve, reject };
  });

  return { promise, deferred };
};

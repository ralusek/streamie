/**
 * Promise resolve function type.
 */
export type PromiseResolve<T = any> = (reason?: T | PromiseLike<T>) => void;

/**
 * Promise reject function type.
 */
export type PromiseReject<T extends Error = Error> = (error: T) => void;

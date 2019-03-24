/**
 * Promise resolve function type.
 */
export type PromiseResolve<T = any> = (reason?: T | PromiseLike<T>) => void;

/**
 * Promise reject function type.
 */
export type PromiseReject<T extends Error = Error> = (error: T) => void;


/**
 *
 */
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

/**
 *
 */
export type Optionalize<T, K extends keyof T> = Omit<T, K> & Partial<T>;

/**
 * Identity
 */
export type Identity<T> = T;

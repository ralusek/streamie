import type { Config } from '../../types.js';

export type NormalizedRetry = {
  // How many times a failed invocation is re-attempted (total tries = attempts + 1).
  attempts: number;
  // Milliseconds to wait before the given (1-based) retry attempt.
  delay: (attempt: number) => number;
};

// Normalizes the retry config to { attempts, delay } or null when retries are off.
// A bare number is shorthand for that many retries with no delay. attempts: 0 (or
// retry: 0) normalizes to null so the hot path pays nothing when retry is
// effectively disabled.
export default (config: Config): NormalizedRetry | null => {
  const retry = config.retry;
  if (retry === undefined) return null;

  const attempts = typeof retry === 'number' ? retry : retry?.attempts;
  const delay = typeof retry === 'number' ? undefined : retry?.delay;

  if (!Number.isInteger(attempts) || (attempts as number) < 0) {
    throw new Error('retry attempts must be a non-negative integer.');
  }
  if ((delay !== undefined) && (typeof delay !== 'function') && (typeof delay !== 'number' || Number.isNaN(delay) || delay < 0)) {
    throw new Error('retry delay must be a non-negative number of milliseconds or a function of the attempt number.');
  }

  if (attempts === 0) return null;

  return {
    attempts: attempts as number,
    delay: typeof delay === 'function' ? delay : () => delay ?? 0,
  };
};

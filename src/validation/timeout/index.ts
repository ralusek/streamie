import type { Config } from '../../types.js';

// Coerces and validates the per-invocation timeout. Undefined (or Infinity) means no
// timeout; anything else must be a positive number of milliseconds.
export default (config: Config): number | null => {
  const timeout = config.timeout;
  if ((timeout === undefined) || (timeout === Infinity)) return null;

  if (typeof timeout !== 'number' || Number.isNaN(timeout) || (timeout <= 0)) {
    throw new Error('timeout must be a positive number of milliseconds.');
  }

  return timeout;
};

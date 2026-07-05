import type { Config } from '../../types.js';

// Coerces and validates concurrency. Undefined means the sequential default of 1.
// Infinity is a legitimate setting (no cap on in-flight invocations); anything else
// must be a positive integer. Rejecting zero/negative/fractional values here matters
// because the process loop compares `handling >= concurrency` — a zero or negative
// value would silently deadlock the stage rather than error.
export default (config: Config): number => {
  const concurrency = config.concurrency ?? 1;

  if (concurrency !== Infinity && (!Number.isInteger(concurrency) || (concurrency < 1))) {
    throw new Error('concurrency must be a positive integer (or Infinity).');
  }

  return concurrency;
};

// Coerces and validates maxBatchWait. Undefined means Infinity: a partial batch
// waits indefinitely for a full batch (flushed only by a drain). Any explicit value
// must be a positive number of milliseconds — zero and negatives are rejected rather
// than coerced, because the previous `|| Infinity` coercion turned an explicit 0
// ("don't wait") into "wait forever", the exact opposite of what was asked.
export default (maxBatchWait: number | undefined): number => {
  if (maxBatchWait === undefined) return Infinity;

  if (typeof maxBatchWait !== 'number' || Number.isNaN(maxBatchWait) || (maxBatchWait <= 0)) {
    throw new Error('maxBatchWait must be a positive number of milliseconds.');
  }

  return maxBatchWait;
};

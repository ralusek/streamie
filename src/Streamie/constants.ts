// Types
import { StreamieConfig } from "./types";

/**
 * Symbol indicating that a stream should omit the returned value.
 */
export const STREAMIE_SHOULD_OMIT = Symbol.for('STREAMIE_SHOULD_OMIT');

/** The default configuration values for StreamieConfig */
export const DEFAULT_CONFIG: Partial<StreamieConfig> = {
  concurrency: Infinity,
  batchSize: 1,
  shouldSaturateChildren: true,
};

import { StreamieConfig } from "@root/Streamie/types";

/**
 * Configuration object for the filter function. Extends standard StreamieConfig.
 */
export type FilterConfig = StreamieConfig & {
  predicate: (test: any) => boolean
};

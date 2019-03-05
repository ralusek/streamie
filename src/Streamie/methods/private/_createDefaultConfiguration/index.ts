// Types
import { StreamieConfig } from "@root/Streamie/types";

// Constants
import { DEFAULT_CONFIG } from "@root/Streamie/constants";


/**
 * Set up defaults for Streamie config
 * @param config - The Streamie's configuration object
 * @returns Configuration with defaults.
 */
export default (config: StreamieConfig): StreamieConfig => {
  return {
    ...DEFAULT_CONFIG,
    ...config,
  };
};

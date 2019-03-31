// Types
import { StreamieNodeState } from '@root/StreamieNode/types';
import { StreamieNodeProtectedEventName } from './types';

// Event Handlers
import outputted from './handlers/outputted';

/**
 * Bootstrap event handlers.
 */
export default <I, O>(
  state: StreamieNodeState<I, O>,
) => {
  state.protected.emittie.on(StreamieNodeProtectedEventName.Outputted, outputted);
};
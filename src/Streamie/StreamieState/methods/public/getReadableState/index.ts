// Types
import { StreamieStatePublic, StreamieStatePrivateNamespace } from "@root/Streamie/StreamieState/types";
import { P } from "@root/utils/namespace";
import StreamieState from "@root/Streamie/StreamieState";

// Private Methods
import _isChildBlocking from "../../private/_isChildBlocking";


/**
 * Retrieve StreamieState in a publicly digestible format.
 * @returns The public state
 */
export default (
  p: P<StreamieState, StreamieStatePrivateNamespace>,
  self: StreamieState
): StreamieStatePublic => {
  const state: StreamieStatePublic | any = {
    count: {
      queued: self.queue.length,
      handling: self.handling.size,
    },
    maxConcurrency: p(self).config.concurrency,
    batchSize: p(self).config.batchSize,
    isPaused: p(self).isPaused,
    isStopped: p(self).isStopped,
    isCompleting: p(self).isCompleting,
    isCompleted: p(self).isCompleted
  };

  state.isAtConcurrentCapacity = state.count.handling === state.maxConcurrency;

  state.isBlocked = state.isPaused ||
    state.isStopped ||
    state.isCompleting ||
    state.isCompleted ||
    state.isAtConcurrentCapacity ||
    _isChildBlocking(self.children);

  return state;
}

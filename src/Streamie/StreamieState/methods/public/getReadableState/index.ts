// Types
import { StreamieStatePublic, StreamieStatePrivateNamespace } from "@root/Streamie/StreamieState/types";
import { P } from "@root/utils/namespace";
import StreamieState from "@root/Streamie/StreamieState";

// Private Methods
import _canPushToChildren from "../../private/_canPushToChildren";


/**
 * Retrieve StreamieState in a publicly digestible format.
 * TODO: Memoize as much as possible
 * @param p - The private namespace getter
 * @param self - The Streamie instance
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

  state.maxBacklogLength = p(self).config.maxBacklogLength ||
                           (p(self).config.maxBacklogFromConcurrency * state.maxConcurrency);

  state.isAtConcurrentCapacity = state.count.handling === state.maxConcurrency;
  state.isAtBacklogCapacity = state.count.queued >= state.maxBacklogLength;
  state.canPushToChildren = _canPushToChildren(p, self);

  state.canHandle = !(
    state.isAtConcurrentCapacity ||
    state.isPaused ||
    state.isStopped ||
    state.isCompleted ||
    !state.canPushToChildren
  );

  return state;
}

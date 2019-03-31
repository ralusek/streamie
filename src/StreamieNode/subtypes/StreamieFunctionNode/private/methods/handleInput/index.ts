// Types
import { StreamieFunctionNodeState } from '../../../types';
import { StreamieNodeSubtypePushConfig } from '@root/StreamieNode/subtypes/types';
import { StreamieNodeProtectedEventName } from '@root/StreamieNode/protected/events/types';

// Type Guards
import isPromiseLike from '@root/typeGuards/isPromiseLike';

export default <I, O>(
  state: StreamieFunctionNodeState<I, O>,
  input: I,
  {id}: StreamieNodeSubtypePushConfig,
) => {
  const payloadMeta = {
    input,
    inputId: id,
  };

  const emitOutput = (result: any) => state.root.protected.emittie.emit(StreamieNodeProtectedEventName.Outputted, result, payloadMeta);

  const result = state.subtype.private.handler(input, {
    inputId: id,
    streamie: state.root.public,
    output: emitOutput,
    state: state.root.protected.handlerState,
  });

  // If handler returns a value or a promise, emit it as output.
  if (result === undefined) return;
  if (isPromiseLike<O>(result)) result.then(result => emitOutput(result));
  else emitOutput(result);
};
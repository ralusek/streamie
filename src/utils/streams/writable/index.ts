// Types
import type { Streamie } from '../../../types';
import type { WritableStreamLike } from '..';

// Pipes a streamie's outputs into a WHATWG WritableStream, resolving once the
// streamie has drained and the sink has closed — the same contract as
// ReadableStream.pipeTo, including its default error propagation:
//   - streamie drains          -> writer.close()
//   - streamie aborts/halts    -> writer.abort(error), and the returned promise
//                                 rejects with that error
//   - sink write/close rejects -> streamie.abort(error), so the pipeline upstream
//                                 stops producing into a dead sink, and the returned
//                                 promise rejects with that error
//
// Backpressure flows through both await points: writer.write's promise paces this
// loop by the sink's queuing strategy, and the async iterator paces the streamie by
// the loop. A previously consumer-less streamie may have retained outputs, which
// will flush here; with existing consumers, iteration observes only items not yet
// delivered to them.
export default async function toWritableStream<O>(
  streamie: Streamie<any, O>,
  // NoInfer: O comes from the streamie alone. Real writers declare write(chunk?: W),
  // and inferring from that optional parameter would widen O to include undefined.
  stream: WritableStreamLike<NoInfer<O>>,
): Promise<void> {
  const writer = stream.getWriter();
  // Unlocks the stream once the pipe is done with it, the same finalization pipeTo
  // performs. Guarded: releaseLock is optional on the structural type, and throws on
  // some older implementations.
  const releaseWriter = () => {
    try { writer.releaseLock?.(); } catch {}
  };
  let isSinkFailure = false;
  try {
    for await (const item of streamie) {
      try {
        await writer.write(item);
      } catch (error) {
        // The sink failed; stop the pipeline feeding it.
        isSinkFailure = true;
        streamie.abort(error);
        throw error;
      }
    }
    try {
      await writer.close();
    } catch (error) {
      // Also the sink's failure, but the streamie has already drained by the time
      // close() is attempted, so there is nothing left to abort.
      isSinkFailure = true;
      throw error;
    }
    releaseWriter();
  } catch (error) {
    if (isSinkFailure) {
      releaseWriter();
    } else {
      // Anything else rejecting is the source side — the iteration itself failed
      // (abort or propagated handler error) — so tear down the sink with that
      // error. Awaited, matching pipeTo's finalization order: the returned promise
      // rejects only once the sink's abort has settled and the lock is released, so
      // a caller catching the source error never observes a still-locked stream.
      // The .then(releaseWriter, releaseWriter) both performs the unlock and
      // swallows any abort rejection — the source error, not the teardown's, is
      // what the caller should see.
      await writer.abort(error).then(releaseWriter, releaseWriter);
    }
    throw error;
  }
}

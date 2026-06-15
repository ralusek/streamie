// Types
import type { Writable } from 'node:stream';
import type { Streamie } from '../../../types';

// Pipes a streamie's outputs into a node:stream Writable — the Node mirror of
// toWritableStream — resolving once the streamie has drained and the sink has finished.
// The same contract as ReadableStream.pipeTo / Node's pipeline, including default error
// propagation:
//   - streamie drains          -> writable.end(), resolve once it has flushed
//   - streamie aborts/halts    -> writable.destroy(error), and the returned promise
//                                 rejects with that error
//   - sink write/error         -> streamie.abort(error), so the pipeline upstream stops
//                                 producing into a dead sink, and the returned promise
//                                 rejects with that error
//
// Backpressure flows through both pause points: writable.write returning false parks
// the loop until 'drain' (Node write backpressure), and the async iterator paces the
// streamie by the loop. A previously consumer-less streamie may have retained outputs,
// which flush here; with existing consumers, iteration observes only items not yet
// delivered to them.
//
// objectMode is the writable's concern, not this bridge's: a streamie emits arbitrary
// values, so a sink consuming them must be in object mode (or the outputs must already
// be Buffer/Uint8Array/string for a byte sink).
// A Writable isn't generic over its chunk type, so — unlike toWritableStream, which
// has to NoInfer O out of the writer's parameter — there is nothing here to infer O
// against; the streamie is its sole source.
export default function toWritable<O>(
  streamie: Streamie<any, O>,
  writable: Writable,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let isSettled = false;
    // Distinguishes the two failure directions for settle(): a sink failure must abort
    // the source, a source failure must destroy the sink. (See the mapping above.)
    let isSinkFailure = false;

    // Releases a pending waitForDrain park, if any. Set while the loop is waiting on
    // 'drain'; invoked by 'drain' itself, or by a sink 'error'/'close' that would
    // otherwise leave the loop waiting on a 'drain' that never comes.
    let releaseDrain: (() => void) | null = null;

    const onSinkError = (error: Error) => {
      // The sink emitted 'error' (an asynchronous _write/_final failure). Mark it a
      // sink failure so settle aborts the source rather than destroying the sink.
      isSinkFailure = true;
      releaseDrain?.();
      settle(error);
    };
    // A 'close' that did not follow our own end() means the sink went away under the
    // pipeline — destroyed externally, or ended elsewhere — without an 'error'. Our own
    // end() path settles first (its callback runs on 'finish', before 'close'), so by
    // the time that close arrives isSettled is already true and this is a no-op. An
    // *early* close is a sink failure: left unhandled, the next write() merely returns
    // false and the loop would park forever on a 'drain' that never comes, so wake any
    // pending drain wait and settle, which aborts the source feeding the dead sink.
    const onSinkClose = () => {
      releaseDrain?.();
      if (isSettled) return;
      isSinkFailure = true;
      const error = new Error('The destination stream closed before the pipeline finished.');
      (error as { code?: string }).code = 'ERR_STREAM_PREMATURE_CLOSE';
      settle(error);
    };
    writable.on('error', onSinkError);
    writable.on('close', onSinkClose);

    function settle(error?: unknown) {
      if (isSettled) return;
      isSettled = true;
      writable.removeListener('error', onSinkError);
      writable.removeListener('close', onSinkClose);
      if (error === undefined) {
        resolve();
        return;
      }
      if (isSinkFailure) {
        // The sink is already failing; stop the source producing into it. (The sink
        // needs no teardown — it tore itself down, having emitted the 'error' that
        // onSinkError already consumed.)
        streamie.abort(error);
      } else {
        // A source-side failure (an abort or a propagated handler error): tear down the
        // sink with that error, mirroring toWritableStream / pipeTo finalization.
        // destroy(error) re-emits 'error' on the writable; attach a swallowing listener
        // so that re-emission isn't an unhandled 'error' event (which would crash the
        // process). The source error is already surfaced to the caller via reject — the
        // sink's teardown echo is not what they should see.
        writable.once('error', () => {});
        writable.destroy(error as Error);
      }
      reject(error);
    }

    function waitForDrain(): Promise<void> {
      return new Promise<void>((resolveDrain) => {
        if (isSettled) return resolveDrain();
        const done = () => {
          writable.removeListener('drain', done);
          releaseDrain = null;
          resolveDrain();
        };
        releaseDrain = done;
        writable.once('drain', done);
      });
    }

    (async () => {
      for await (const item of streamie) {
        if (isSettled) return;
        let canContinue: boolean;
        try {
          canContinue = writable.write(item);
        } catch (error) {
          // A synchronous write failure (e.g. writing after the sink ended/destroyed).
          isSinkFailure = true;
          throw error;
        }
        if (!canContinue) {
          await waitForDrain();
          if (isSettled) return;
        }
      }
      // The streamie drained: close the sink and resolve once it has flushed. The end
      // callback fires on 'finish' — only on a clean close. A failure during the sink's
      // final flush does not reach this callback (it is not passed an error); it surfaces
      // as an 'error' event instead, which onSinkError settles (as a sink failure)
      // before 'finish' is ever reached. So both outcomes are covered without inspecting
      // an end error here.
      writable.end(() => settle());
    })().catch((error) => {
      // The iteration failed — a source-side abort or propagated handler error — unless
      // a synchronous write marked it a sink failure above. settle routes each.
      settle(error);
    });
  });
}

// Types
import type { Writable } from 'node:stream';
import type { Streamie } from '../../../types.js';
import type { Unsubscribe } from '../../events/index.js';

// Pipes a streamie's outputs into a node:stream Writable — the Node mirror of
// toWritableStream — resolving once the streamie has drained and the sink has finished.
// The same contract as ReadableStream.pipeTo / Node's pipeline, including default error
// propagation:
//   - streamie drains          -> writable.end(), resolve once it has flushed
//   - streamie aborts/halts    -> writable.destroy(error), and the returned promise
//                                 rejects with that error — including while the loop is
//                                 parked on sink backpressure (the halt wakes the park,
//                                 so a wedged sink can't hide a source failure)
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
  streamie: Streamie<any, O, any>,
  writable: Writable,
): Promise<void> {
  // The consumer is registered synchronously, before the sink is touched: registering
  // on a sink streamie throws, and that argument error must surface at the call —
  // matching toReadable — rather than fall through the failure paths below, where it
  // would read as a source failure and destroy the caller's healthy writable.
  const iterator = streamie[Symbol.asyncIterator]();

  return new Promise<void>((resolve, reject) => {
    let isSettled = false;
    // Distinguishes the two failure directions for settle(): a sink failure must abort
    // the source, a source failure must destroy the sink. (See the mapping above.)
    let isSinkFailure = false;

    // Releases a pending waitForDrain park, if any. Set while the loop is waiting on
    // 'drain'; invoked by 'drain' itself, or by a sink 'error'/'close' — or a source
    // halt — that would otherwise leave the loop waiting on a 'drain' that never comes.
    let releaseDrain: (() => void) | null = null;

    // A source-side halt while the loop is parked on sink backpressure would otherwise
    // go unobserved until the sink drains — which a wedged sink never does. Waking the
    // park lets the loop's next iterator step observe the halt (a rejection carrying
    // the terminating error), which settles through the source-failure branch below and
    // destroys the sink with it. onHalted latches, so a source already halted at call
    // time invokes this immediately (releaseDrain is null then; the loop's first
    // iterator step delivers the error).
    const unsubscribeHalt: Unsubscribe = streamie.onHalted(() => {
      releaseDrain?.();
    });

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
      unsubscribeHalt();
      writable.removeListener('error', onSinkError);
      writable.removeListener('close', onSinkClose);
      if (error === undefined) {
        resolve();
        return;
      }
      if (isSinkFailure) {
        // The sink is already failing; stop the source producing into it. (The sink
        // needs no teardown — it tore itself down, having delivered the failure that
        // routed here.)
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

    // A writable that is already destroyed or ended can never deliver the signals the
    // paths below rely on: its 'close' fired before these listeners attached (never to
    // fire again), and a write to a destroyed stream merely returns false without
    // emitting 'error' — which would park the loop on a 'drain' that never comes.
    // Fail fast with the same premature-close sink failure an early close settles
    // with (aborting the source, which was already registered above).
    if (writable.destroyed || writable.writableEnded) onSinkClose();

    (async () => {
      for await (const item of iterator) {
        if (isSettled) return;
        let canContinue: boolean;
        try {
          canContinue = writable.write(item);
        } catch (error) {
          // A synchronous write failure (e.g. an invalid chunk type for a byte sink).
          isSinkFailure = true;
          throw error;
        }
        if (!canContinue) {
          await waitForDrain();
          if (isSettled) return;
        }
      }
      // The streamie drained: close the sink and resolve once it has flushed. The
      // callback's error argument is load-bearing: when a final-flush (or a write still
      // buffered at end()) fails *asynchronously*, Node invokes this callback with the
      // error BEFORE emitting 'error' — so onSinkError cannot be relied on to have
      // settled first (it has only when the failure was synchronous, where the ordering
      // inverts). Ignoring the argument here would resolve the pipe as successful and
      // then leave the subsequent 'error' emission unlistened (settle removes
      // onSinkError), crashing the process.
      writable.end((error?: Error | null) => {
        if (error === undefined || error === null) return settle();
        if (isSettled) return;
        // Route it as a sink failure, and swallow the 'error' re-emission that follows
        // this callback in the asynchronous ordering.
        isSinkFailure = true;
        writable.once('error', () => {});
        settle(error);
      });
    })().catch((error) => {
      // The iteration failed — a source-side abort or propagated handler error — unless
      // a synchronous write marked it a sink failure above. settle routes each.
      settle(error);
    });
  });
}

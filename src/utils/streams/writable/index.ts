// Types
import type { Streamie } from '../../../types.js';

// Pipes a streamie's outputs into a WHATWG WritableStream, resolving once the
// streamie has drained and the sink has closed — the same contract as
// ReadableStream.pipeTo, including its default error propagation in both directions:
//   - streamie drains          -> writer.close()
//   - streamie aborts/halts    -> writer.abort(error), and the returned promise
//                                 rejects with that error — including while the loop
//                                 is parked on sink backpressure (the halt wakes it)
//   - sink errors/aborts       -> streamie.abort(error), so the pipeline upstream
//                                 stops producing into a dead sink, and the returned
//                                 promise rejects with that error. This is observed
//                                 through writer.closed, so a sink dying while the
//                                 loop is idle awaiting the next source item — with no
//                                 in-flight write to reject — still tears the pipe
//                                 down immediately (pipeTo's backward propagation).
//
// Pacing follows pipeTo: the loop awaits writer.ready — the sink's queuing-strategy
// backpressure signal — and hands each chunk over without awaiting its individual
// completion, so a sink with a high water mark above 1 genuinely pipelines (awaiting
// each write() would serialize on per-chunk completion and make the strategy inert).
// The async iterator paces the streamie by the loop. A previously consumer-less
// streamie may have retained outputs, which will flush here; with existing consumers,
// iteration observes only items not yet delivered to them.
export default function toWritableStream<O>(
  streamie: Streamie<any, O, any>,
  // NoInfer: O comes from the streamie alone. Real writers declare write(chunk?: W),
  // and inferring from that optional parameter would widen O to include undefined.
  stream: WritableStream<NoInfer<O>>,
): Promise<void> {
  // The consumer is registered synchronously, before the sink is touched: registering
  // on a sink streamie throws, and that argument error must surface at the call —
  // matching toReadableStream — rather than fall through the failure paths below,
  // where it would read as a source failure and abort the caller's healthy sink.
  const iterator = streamie[Symbol.asyncIterator]();

  let writer: WritableStreamDefaultWriter<O>;
  try {
    writer = stream.getWriter();
  } catch (error) {
    // Locked (or otherwise unwritable) stream: undo the registration — a voluntary
    // detach, leaving the streamie unaffected — and surface the argument error.
    void iterator.return?.();
    throw error;
  }

  return pump(streamie, iterator, writer);
}

async function pump<O>(
  streamie: Streamie<any, O, any>,
  iterator: AsyncIterableIterator<O>,
  writer: WritableStreamDefaultWriter<O>,
): Promise<void> {
  // Unlocks the stream once the pipe is done with it, the same finalization pipeTo
  // performs. Guarded: releaseLock throws on some older implementations.
  const releaseWriter = () => {
    try { writer.releaseLock(); } catch {}
  };
  let isSinkFailure = false;
  // Latched once the pipe itself is finished with the sink (clean close, or teardown
  // of either side), so the closed watcher below can tell a real sink death from the
  // rejection its own finalization causes (writer.abort errors the stream with the
  // source's error; it is not a second, sink-originated failure).
  let isFinished = false;

  // pipeTo's backward error propagation: writer.closed rejects the moment the sink
  // errors or is aborted — including while the loop is parked awaiting the next source
  // item, when there is no in-flight write to observe the failure through. Aborting
  // the streamie both stops the pipeline upstream and releases that park (the
  // iteration rejects with this same error), which settles through the sink-failure
  // path below.
  writer.closed.then(
    () => {}, // resolves only after our own close()
    (error: unknown) => {
      if (isFinished) return;
      isSinkFailure = true;
      streamie.abort(error);
    },
  );

  // Resolves when the source terminates abnormally, releasing a park on writer.ready:
  // backpressure is a *healthy* sink's signal, so nothing on the writer side would
  // otherwise wake the loop to observe the halt (a wedged sink plus a source abort
  // would hang forever). The halt's error is captured so the park, once woken, can
  // settle through the source-failure path directly — the loop is holding an
  // already-yielded chunk at that point, and falling through would write it to the
  // sink after the source aborted; only the next iterator step would surface the
  // halt, one chunk too late. onHalted latches, so a source already halted at call
  // time resolves this immediately.
  let unsubscribeHalt: () => void = () => {};
  let isSourceHalted = false;
  let sourceHaltError: unknown;
  const sourceHalted = new Promise<void>((resolve) => {
    unsubscribeHalt = streamie.onHalted(({ isAborted, abortError, lastError }) => {
      isSourceHalted = true;
      // The undefined check (rather than ??) is deliberate: abort errors are
      // arbitrary external values, so null and other falsey reasons are delivered as
      // given; only a bare abort() gets the generic error.
      sourceHaltError = isAborted
        ? (abortError === undefined ? new Error('Streamie was aborted.') : abortError)
        : (lastError ?? new Error('Streamie was halted.'));
      resolve();
    });
  });

  try {
    for await (const item of iterator) {
      // pipeTo pacing: park only while the sink's queue is full. desiredSize is null
      // on an errored stream and <= 0 on a full queue; only the full queue parks (an
      // errored sink is delivered through the closed watcher and the next iteration).
      if (writer.desiredSize !== null && writer.desiredSize <= 0) {
        // ready's rejection (a sink death) is swallowed: the closed watcher above
        // routes the same failure through the streamie abort, and the loop's next
        // iterator step surfaces it with the error.
        await Promise.race([writer.ready.catch(() => {}), sourceHalted]);
        // The source halting is what woke the park (or it halted while the sink was
        // draining its queue): the held chunk must NOT be written — the source is
        // dead, and this is exactly the source-failure teardown, just observed here
        // rather than at the next iterator step. (A sink death also lands here, via
        // the closed watcher's abort of the source; sourceHaltError is then that
        // same sink error, so the settlement is identical either way.)
        if (isSourceHalted) throw sourceHaltError;
      }
      // Fire-and-forget, per pipeTo: the chunk joins the sink's queue; its individual
      // completion is deliberately not awaited. A failed write errors the stream,
      // which the closed watcher observes (and writer.close() below re-surfaces on
      // the clean path); the per-write rejection is that same failure again, so it is
      // swallowed rather than left to become an unhandled rejection.
      void writer.write(item).catch(() => {});
    }
    try {
      // Waits for every queued write to complete and the sink to close; a failure
      // among them (or in the sink's own close) rejects here with that error.
      await writer.close();
    } catch (error) {
      // Also the sink's failure, but the streamie has already drained by the time
      // close() is attempted, so there is nothing left to abort.
      isSinkFailure = true;
      throw error;
    }
    isFinished = true;
    releaseWriter();
  } catch (error) {
    isFinished = true;
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
  } finally {
    unsubscribeHalt();
  }
}

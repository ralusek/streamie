// Types
import type { Streamie } from '../../../types';
import type { ReadableStreamLike, ReadableStreamDefaultReaderLike } from '..';

// Utils
import type { Unsubscribe } from '../../events';

// Pumps a WHATWG ReadableStream into a streamie: reads chunks and pushes them,
// pausing on the receipt's backpressure signal so the stream is only pulled as fast
// as the pipeline absorbs items. Termination maps in both directions:
//   - stream ends               -> target.drain()
//   - stream errors             -> target.abort(error)
//   - target halts              -> reader.cancel(abort/handler error)
//   - target draining           -> reader.cancel() (the pipeline no longer accepts pushes)
//
// "Target halts" covers more than it appears to: the core cascades downstream
// failure upstream (a consumer halt that leaves a streamie consumer-less aborts
// it), so a failure at any depth in the pipeline reaches the target and lands here
// carrying the root error — the source-cancellation contract of pipeTo across a
// pipeThrough chain, with no bridge-specific liveness tracking. preventCancel
// (pipeTo's option) doesn't exempt the target from that cascade — the pipeline is
// genuinely dead — it only spares the stream itself: the lock is released without
// cancelling, leaving the stream readable by another consumer.
//
// This lives apart from fromReadableStream itself (in the main entry) because it
// only needs an existing streamie, keeping this module free of an import cycle with
// the factory.
export default function pumpReadableStream<I>(
  stream: ReadableStreamLike<I>,
  target: Streamie<I, any>,
  options: { preventCancel?: boolean } = {},
): void {
  // A zero-argument getReader() is guaranteed by spec to return the default reader;
  // the cast just undoes the union ReadableStreamLike declares for lib.dom's
  // overloads (see the type's comment).
  const reader = stream.getReader() as ReadableStreamDefaultReaderLike<I>;
  let isStopped = false;

  // Unlocks the stream once the pump is done with it, the same finalization pipeTo
  // performs. Guarded: releaseLock is optional on the structural type, and throws on
  // some older implementations.
  function releaseReader() {
    try { reader.releaseLock?.(); } catch {}
  }

  // Stops pulling and releases the source. cancel() also resolves any in-flight
  // read() as done, which is how a stop lands mid-await; its promise can reject if
  // the stream has already errored, which the pump has by then either delivered or
  // caused, so it is swallowed. The lock is released only once cancel settles, so a
  // pending read resolves done rather than rejecting on the release.
  function stop(cancelReason?: unknown) {
    if (isStopped) return;
    isStopped = true;
    // preventCancel: release the lock without cancelling. This rejects any
    // in-flight read(), which the pump loop's catch swallows (isStopped is set).
    if (options.preventCancel) return releaseReader();
    reader.cancel(cancelReason).then(releaseReader, releaseReader);
  }

  // The target terminating out from under the pump — an external abort, a downstream
  // handler error, an external drain — means it no longer accepts pushes. Both events
  // latch, so a target already terminated at pump creation stops before the first read.
  target.onDraining(() => stop());
  target.onHalted(({ isAborted, abortError, lastError }) => {
    stop(isAborted ? abortError : lastError ?? undefined);
  });

  // Resolves when the target can take another push: a backpressure release, or a
  // termination (so the loop can observe isStopped rather than hang on a release
  // that will never come).
  function waitForCapacity(): Promise<void> {
    return new Promise<void>((resolve) => {
      let isSettled = false;
      const unsubscribes: Unsubscribe[] = [];
      const settle = () => {
        if (isSettled) return;
        isSettled = true;
        for (const unsubscribe of unsubscribes) unsubscribe();
        resolve();
      };
      unsubscribes.push(target.onBackpressureRelease.once(settle));
      unsubscribes.push(target.onDraining.once(settle));
      unsubscribes.push(target.onHalted.once(settle));
      // A latched event invokes settle synchronously at subscription, before the
      // later subscriptions exist; sweep again so none are left attached.
      if (isSettled) for (const unsubscribe of unsubscribes) unsubscribe();
    });
  }

  (async () => {
    while (true) {
      const result = await reader.read();
      if (isStopped) return;
      if (result.done) break;
      const receipt = target.push(result.value);
      if (receipt.backpressure) {
        await waitForCapacity();
        if (isStopped) return;
      }
    }
    // Set before drain(): our own drain fires onDraining, and the stop() there would
    // otherwise cancel a reader the stream has already cleanly ended.
    isStopped = true;
    releaseReader();
    target.drain();
  })().catch((error) => {
    // A read() rejection: the stream errored, which is externally imposed abnormal
    // termination of the pipeline — exactly what abort models.
    if (isStopped) return;
    isStopped = true;
    releaseReader();
    target.abort(error);
  });
}

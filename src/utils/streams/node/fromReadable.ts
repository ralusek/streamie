// Types
import type { Readable } from 'node:stream';
import type { Streamie } from '../../../types';

// Utils
import waitForCapacity from '../waitForCapacity';
import type { Unsubscribe } from '../../events';

// The Node mirror of pumpReadableStream: pumps a node:stream Readable into a streamie,
// reading chunks and pushing them, pausing on the receipt's backpressure signal so the
// stream is only consumed as fast as the pipeline absorbs items. A Readable is itself
// async-iterable, so iteration *is* the read loop — and async iteration of a Readable
// pauses it whenever the loop is suspended, which is how the receipt's backpressure
// reaches the source with no flowing/paused juggling here. Termination maps in both
// directions:
//   - stream ends               -> target.drain()
//   - stream errors             -> target.abort(error)
//   - target halts              -> readable.destroy()  (stop consuming the source)
//   - target draining           -> readable.destroy()  (the pipeline no longer accepts pushes)
//
// "Target halts" covers more than it appears to: the core cascades downstream failure
// upstream (a consumer halt that leaves a streamie consumer-less aborts it), so a
// failure at any depth in the pipeline reaches the target and lands here, destroying
// the source — the Node analogue of pipeline() tearing down its source on a
// destination error, with no bridge-specific liveness tracking.
//
// The destroy on teardown is deliberately error-free: the downstream failure did not
// originate in the readable, and destroy(error) would emit an 'error' event on it
// (throwing if unlistened). A clean destroy() simply stops the source, the same role
// reader.cancel() plays for the WHATWG pump.
//
// This lives apart from fromReadable itself (in the node entry) so that the pump can
// be exercised against any streamie, mirroring the pumpReadableStream/fromReadableStream
// split.
export default function fromReadable<I>(
  readable: Readable,
  target: Streamie<I, any>,
): void {
  let isStopped = false;

  // The target's terminal-event subscriptions, torn down on any terminal path. Both
  // onDraining and onHalted latch, so whichever fires clears itself — but in a clean
  // end only onDraining fires (and in a halt only onHalted), leaving the *other*
  // subscription's closure (which retains this readable) attached to a long-lived
  // target forever. Unsubscribing both from finalize() closes that retention.
  const subscriptions: Unsubscribe[] = [];
  function finalize() {
    while (subscriptions.length > 0) subscriptions.pop()!();
  }

  // Stops consuming and tears down the source. Guarded so the teardown paths (target
  // termination, stream end, stream error) don't re-enter. Destroying mid-iteration
  // rejects the async iterator's pending next() (or the for-await's eventual
  // return()), which the loop's catch swallows once isStopped is set.
  function stop() {
    if (isStopped) return;
    isStopped = true;
    finalize();
    readable.destroy();
  }

  // The target terminating out from under the pump — an external abort, a downstream
  // handler error, an external drain — means it no longer accepts pushes. Both events
  // latch, so a target already terminated at pump creation stops before the first read.
  subscriptions.push(target.onDraining(() => stop()));
  subscriptions.push(target.onHalted(() => stop()));

  (async () => {
    for await (const chunk of readable) {
      if (isStopped) return;
      const receipt = target.push(chunk as I);
      if (receipt.backpressure) {
        await waitForCapacity(target);
        if (isStopped) return;
      }
    }
    // The stream ended cleanly. Guard against a stop() that ended the iteration without
    // throwing: a destroyed readable can finish its for-await as done rather than
    // rejecting, and draining an already-terminated target would be wrong.
    if (isStopped) return;
    isStopped = true;
    finalize();
    target.drain();
  })().catch((error) => {
    // A read rejected: the stream errored, which is externally imposed abnormal
    // termination of the pipeline — exactly what abort models. (A teardown destroy
    // can also surface here as a premature-close rejection; isStopped is set by then,
    // so it is swallowed.)
    if (isStopped) return;
    isStopped = true;
    finalize();
    target.abort(error);
  });
}

// Types
import type { Streamie } from '../../types.js';
import type { Unsubscribe } from '../events/index.js';

// Resolves when a streamie can take another push: a backpressure release, or a
// termination (draining/halted) — the latter so a paused producer observes the
// terminal state and stops, rather than hanging on a release that will never come.
//
// Shared by the stream pumps (WHATWG pumpReadableStream, Node fromReadable): both
// push into a target streamie and park whenever push returns true (backpressured),
// only resuming the source as fast as the pipeline absorbs items. The caller is expected
// to re-check its own stopped flag once this resolves, since a termination resolves
// it just as a real release does.
export default function waitForCapacity(target: Streamie<any, any>): Promise<void> {
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
    // A latched event invokes settle synchronously at subscription, before the later
    // subscriptions exist; sweep again so none are left attached.
    if (isSettled) for (const unsubscribe of unsubscribes) unsubscribe();
  });
}

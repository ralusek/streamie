import yieldToMacrotask from '../yieldToMacrotask/index.js';

// Measures how long the current event-loop "slice" — the stretch of synchronous and
// microtask execution since the last macrotask boundary — has been running. This is
// the actual quantity a time-based yield cares about: starvation is a slice that
// never ends, not a stale per-streamie timestamp (which would also be old after an
// innocent idle period — a pause, a quiet producer — and cause spurious yields).
//
// Mechanism: the first caller within a slice stamps its start and schedules a
// macrotask to end the tracking. If the event loop is turning normally, that
// macrotask runs promptly and the next burst of work starts a fresh slice, so ages
// stay near zero. If processing monopolizes the loop, the clearing macrotask cannot
// run, and the reported age grows until someone yields.
//
// The state is module-level on purpose: every streamie in a starved chain is in the
// same slice, so the pipeline shares one clock rather than each stage waiting out
// its own budget in series.
let sliceStartAt = 0;
let isSliceTracked = false;

// `now` lets a hot loop that has already read the clock this iteration avoid a
// second read — Date.now() per item is measurable at millions of items per second.
// A stale timestamp is safe in both roles: measured against a fresh slice start it
// only understates the age (a yield happens one iteration later than it ideally
// would), and it is never allowed to *seed* a slice — the first call of a slice
// reads the clock itself (once per macrotask turn, so effectively free), because a
// stale seed would overstate every subsequent age in the slice and force a spurious
// yield.
export default function currentSliceAge(now: number = Date.now()): number {
  if (!isSliceTracked) {
    isSliceTracked = true;
    sliceStartAt = Date.now();
    yieldToMacrotask(() => { isSliceTracked = false; });
  }
  // A caller's stale `now` can predate the fresh slice start; that means "the slice
  // just began", not a negative age.
  return now < sliceStartAt ? 0 : now - sliceStartAt;
}

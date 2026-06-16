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
// A slightly stale timestamp only understates the age (a yield happens one
// iteration later than it ideally would), never overstates it.
export default function currentSliceAge(now: number = Date.now()): number {
  if (!isSliceTracked) {
    isSliceTracked = true;
    sliceStartAt = now;
    yieldToMacrotask(() => { isSliceTracked = false; });
  }
  return now - sliceStartAt;
}

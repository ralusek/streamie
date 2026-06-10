// Types
import type { StreamieQueueError } from '../../error';
import type { Streamie } from '../../types';

// Utils
import RingBuffer from '../dataStructures/ringBuffer';
import createEventHandlers, { event, Unsubscribe } from '../events';

export default function createAsyncIterator<OutputItem>(
  registerOutput: (outputStreamie: Streamie<OutputItem, any>) => void,
  state: {
    isHalted: boolean;
    isDrained: boolean;
    lastError: StreamieQueueError<any> | null;
  },
): AsyncIterableIterator<OutputItem> {
  // Creates an async iterator over this streamie's outputs by registering a minimal
  // consumer object satisfying the duck-typed surface the process loop relies on for
  // real downstream streamies (_receive, state.backpressure.input, the lifecycle
  // events). Each call registers a fresh consumer, so concurrent iterators each
  // observe every item (outputs are broadcast to all consumers), and an iterator only
  // observes items processed after it was created — start iterating in the same
  // synchronous block as the pushes, the same contract as attaching a .map.
    type PendingPull = {
      resolve: (result: IteratorResult<OutputItem, undefined>) => void;
      reject: (error: unknown) => void;
    };

    // Items delivered by the source ahead of consumer pulls. The backpressure getter
    // below reports pressure as soon as one item is buffered, so this holds at most
    // one item: delivery is paced by the iterator's pulls, while the source's own
    // output queue (bounded by backpressureAt.output) provides the real buffering.
    let buffer = new RingBuffer<OutputItem>();
    // next() calls awaiting an item. Only ever non-empty while the buffer is empty:
    // _receive resolves a pending pull directly rather than buffering.
    const pendingPulls = new RingBuffer<PendingPull>();

    const consumerEventHandlers = createEventHandlers({
      backpressureRelease: event(),
      draining: event({ latching: true }),
      halted: event({ latching: true }),
    });

    // Unsubscribes from the source's drained/halted events, so that detaching from a
    // long-lived source doesn't leave it retaining this consumer.
    const sourceSubscriptions: Unsubscribe[] = [];

    // The source has drained or halted; whatever is buffered is all that remains.
    let isSourceDone = false;
    // The iteration itself is over: returned early, or a propagated error delivered.
    let isEnded = false;
    // A propagated error awaiting delivery to the next next() call.
    let storedError: unknown = null;
    let isDetached = false;

    // Unhooks this consumer from the source: firing its onDraining handlers tells the
    // source to remove us from its consumers (the same path a draining downstream
    // streamie uses), and the backpressure release nudges its process loop in case it
    // was stalled on our backpressure. Deferred to a microtask because detachment can
    // be triggered from inside the source's own processing (e.g. error propagation
    // mid-handleOnError), where synchronously re-entering requestProcess could process
    // further items before a pending halt is applied.
    function detach() {
      if (isDetached) return;
      isDetached = true;
      queueMicrotask(() => {
        consumerEventHandlers.draining.emit();
        consumerEventHandlers.backpressureRelease.emit();
        while (sourceSubscriptions.length > 0) sourceSubscriptions.pop()!();
      });
    }

    function handleSourceDone() {
      if (isSourceDone || isEnded) return;
      isSourceDone = true;
      // Pending pulls only exist while the buffer is empty, and nothing more will
      // arrive, so they can all be resolved as done.
      while (pendingPulls.length > 0) {
        pendingPulls.shift()!.resolve({ value: undefined, done: true });
      }
    }

    function next(): Promise<IteratorResult<OutputItem, undefined>> {
      if (storedError) {
        const error = storedError;
        storedError = null;
        isEnded = true;
        return Promise.reject(error);
      }
      if (isEnded) return Promise.resolve({ value: undefined, done: true });
      if (buffer.length > 0) {
        const value = buffer.shift()!;
        // Taking the buffered item clears this consumer's backpressure; the release
        // handler (the source's requestProcess) may synchronously deliver the next item.
        consumerEventHandlers.backpressureRelease.emit();
        return Promise.resolve({ value, done: false });
      }
      if (isSourceDone) return Promise.resolve({ value: undefined, done: true });
      return new Promise<IteratorResult<OutputItem, undefined>>((resolve, reject) => {
        pendingPulls.push({ resolve, reject });
      });
    }

    // Invoked on early termination (e.g. a break out of a for await). Stops accepting
    // items and detaches from the source; the source itself is unaffected, matching
    // how a draining downstream streamie is simply removed as a consumer.
    function return_(): Promise<IteratorResult<OutputItem, undefined>> {
      if (!isEnded) {
        isEnded = true;
        storedError = null;
        buffer = new RingBuffer();
        while (pendingPulls.length > 0) {
          pendingPulls.shift()!.resolve({ value: undefined, done: true });
        }
        detach();
      }
      return Promise.resolve({ value: undefined, done: true });
    }

    const consumer = {
      state: {
        backpressure: {
          // Pressure as soon as a single item is waiting: the source's process loop
          // re-checks this between deliveries, so it hands over exactly one item per
          // pull cycle and keeps the rest in its own bounded output queue.
          get input() { return buffer.length > 0; },
        },
        get isDrained() { return isEnded; },
        get isHalted() { return false; },
      },
      onBackpressureRelease: consumerEventHandlers.backpressureRelease.on,
      onDraining: consumerEventHandlers.draining.on,
      onHalted: consumerEventHandlers.halted.on,
      registerInput: (inputStreamie: Streamie<any, OutputItem>) => {
        sourceSubscriptions.push(inputStreamie.onDrained(handleSourceDone));
        // A halt without error propagation ends the iteration silently, the same way
        // a downstream streamie drains when its halted input is removed. When errors
        // do propagate, _pushQueueError has already recorded the rejection by the
        // time the halt event fires.
        sourceSubscriptions.push(inputStreamie.onHalted(handleSourceDone));
      },
      _receive: (item: OutputItem) => {
        if (isEnded || storedError) return;
        if (pendingPulls.length > 0) {
          pendingPulls.shift()!.resolve({ value: item, done: false });
          return;
        }
        buffer.push(item);
      },
      _pushQueueError: (queueError: StreamieQueueError<any>) => {
        if (isEnded || isSourceDone || storedError) return;
        // An error preempts buffered output, mirroring how error propagation between
        // streamies is immediate rather than queued behind in-flight items.
        buffer = new RingBuffer();
        if (pendingPulls.length > 0) {
          isEnded = true;
          while (pendingPulls.length > 0) pendingPulls.shift()!.reject(queueError);
        } else {
          storedError = queueError;
        }
        detach();
      },
    } as unknown as Streamie<OutputItem, any>;

    if (state.isHalted) {
      storedError = state.lastError ?? new Error('Cannot iterate a halted streamie.');
    } else if (state.isDrained) {
      isSourceDone = true;
    } else {
      registerOutput(consumer);
    }

    return {
      next,
      return: return_,
      [Symbol.asyncIterator]() { return this; },
    };
}

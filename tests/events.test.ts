import streamie from '../src';
import createEventHandlers, { event } from '../src/utils/events';
import { StreamieQueueError } from '../src/error';

describe('Event handlers utility', () => {
  test('on delivers every emitted payload until unsubscribed', () => {
    const events = createEventHandlers({ progress: event<number>() });

    const seen: number[] = [];
    const unsubscribe = events.progress.on((value) => seen.push(value));

    events.progress.emit(1);
    events.progress.emit(2);
    unsubscribe();
    events.progress.emit(3);

    expect(seen).toEqual([1, 2]);
  });

  test('once fires exactly once', () => {
    const events = createEventHandlers({ tick: event() });

    let count = 0;
    events.tick.on.once(() => count++);

    events.tick.emit();
    events.tick.emit();

    expect(count).toBe(1);
  });

  test('a once handler can be unsubscribed before it fires', () => {
    const events = createEventHandlers({ tick: event() });

    let count = 0;
    const unsubscribe = events.tick.on.once(() => count++);
    unsubscribe();
    events.tick.emit();

    expect(count).toBe(0);
  });

  test('handlers are independent: removing one leaves the others', () => {
    const events = createEventHandlers({ tick: event() });

    const counts = [0, 0];
    const unsubscribe = events.tick.on(() => counts[0]++);
    events.tick.on(() => counts[1]++);

    events.tick.emit();
    unsubscribe();
    events.tick.emit();

    expect(counts).toEqual([1, 2]);
  });

  test('a once handler re-armed from inside itself waits for the next emit', () => {
    const events = createEventHandlers({ tick: event() });

    let count = 0;
    const arm = () => {
      events.tick.on.once(() => {
        count++;
        arm();
      });
    };
    arm();

    events.tick.emit();
    expect(count).toBe(1);
    events.tick.emit();
    expect(count).toBe(2);
  });

  test('a handler unsubscribed mid-firing by an earlier handler does not fire', () => {
    const events = createEventHandlers({ tick: event() });

    let laterFired = false;
    // Subscription order is delivery order: the first handler removes the second
    // before its turn comes.
    events.tick.on(() => unsubscribeLater());
    const unsubscribeLater = events.tick.on(() => { laterFired = true; });

    events.tick.emit();
    expect(laterFired).toBe(false);
  });

  test('a latching event invokes late subscribers immediately with the latched payload', () => {
    const events = createEventHandlers({ settled: event<string>({ latching: true }) });

    const seen: string[] = [];
    events.settled.on((value) => seen.push(value));
    events.settled.emit('first');
    // Latched: ignored rather than re-fired.
    events.settled.emit('second');
    // Late subscribers (both styles) are invoked synchronously with the latched payload.
    events.settled.on((value) => seen.push(`late:${value}`));
    events.settled.on.once((value) => seen.push(`late-once:${value}`));

    expect(seen).toEqual(['first', 'late:first', 'late-once:first']);
  });
});

describe('Streamie events', () => {
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  test('onDrained attached after the drain is invoked immediately', async () => {
    const s = streamie((input: number) => input, { sink: true });
    s.push(1);
    s.drain();
    await s.promise;

    let invoked = false;
    s.onDrained(() => { invoked = true; });
    expect(invoked).toBe(true);
  });

  test('onDraining and onHalted attached after the transition are invoked immediately', async () => {
    const s = streamie(() => {
      throw new Error('boom');
    }, {});
    s.push(1);
    await s.promise.catch(() => {});

    let draining = false;
    let halted = false;
    // A halt drains nothing, but shouldDrain was never set; only halted has latched.
    s.onHalted(() => { halted = true; });
    expect(halted).toBe(true);

    const d = streamie((input: number) => input, {});
    d.drain();
    d.onDraining(() => { draining = true; });
    expect(draining).toBe(true);
  });

  test('onError delivers the StreamieQueueError', async () => {
    const s = streamie((input: number) => {
      if (input === 2) throw new Error('boom');
      return input;
    }, {});

    let received: unknown = null;
    s.onError((error) => { received = error; });

    [1, 2].forEach((item) => s.push(item));
    await s.promise.catch(() => {});

    expect(received).toBeInstanceOf(StreamieQueueError);
    expect(((received as StreamieQueueError<number>).originalError as Error).message).toBe('boom');
  });

  test('unsubscribing from onBackpressureRelease stops further notifications', async () => {
    const s = streamie(async (input: number) => {
      await delay(2);
      return input;
    }, { backpressureAt: { input: 2 }, sink: true });

    let releases = 0;
    const unsubscribe: () => void = s.onBackpressureRelease(() => {
      releases++;
      // Unsubscribe from inside the first notification; the release cycles produced
      // by the remaining backpressured pushes must not reach this handler again.
      unsubscribe();
    });

    [1, 2, 3, 4, 5, 6].forEach((item) => s.push(item));
    s.drain();
    await s.promise;

    expect(releases).toBe(1);
  });

  test('onBackpressureRelease.once supports the cooperative producer pattern', async () => {
    const s = streamie(async (input: number) => {
      await delay(1);
      return input;
    }, { backpressureAt: { input: 2 } });

    let onceFirings = 0;
    const handled: number[] = [];
    s.each((item) => { handled.push(item); });

    for (let item = 1; item <= 6; item++) {
      if (s.push(item).backpressure) {
        await new Promise<void>((resolve) => s.onBackpressureRelease.once(() => {
          onceFirings++;
          resolve();
        }));
      }
    }
    s.drain();
    await s.promise;

    expect(handled).toEqual([1, 2, 3, 4, 5, 6]);
    // Each once subscription fired exactly once; releases that occurred while no
    // producer was waiting went unobserved rather than accumulating handlers.
    expect(onceFirings).toBeGreaterThan(0);
    expect(onceFirings).toBeLessThanOrEqual(6);
  });

  test('event subscriptions return unsubscribe functions across the board', () => {
    const s = streamie((input: number) => input, {});

    const unsubscribes = [
      s.onBackpressureRelease(() => {}),
      s.onDrained(() => {}),
      s.onDraining(() => {}),
      s.onError(() => {}),
      s.onHalted(() => {}),
    ];

    unsubscribes.forEach((unsubscribe) => {
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });
});

describe('downstream halt cascade', () => {
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  test('the halt of the last consumer halts the source with the consumer\'s error', async () => {
    const s = streamie((input: number) => input, {});
    const tail = s.map(() => { throw new Error('boom'); });

    s.push(1);
    await tail.promise.catch(() => {});

    // The source aborts — externally terminated by downstream failure — carrying
    // the consumer's handler error as the root cause.
    expect(s.state.isHalted).toBe(true);
    expect(s.state.isAborted).toBe(true);
    const rejection = await s.promise.then(() => null, (error) => error);
    expect(rejection).toBeInstanceOf(StreamieQueueError);
    expect((rejection as StreamieQueueError<number>).message).toContain('boom');
  });

  test('cascades only once every consumer has halted', async () => {
    const s = streamie((input: number) => input, {});
    const doomed = s.map(() => { throw new Error('boom'); });
    const keep = s.map((input) => input);

    s.push(1);
    await doomed.promise.catch(() => {});
    // A sibling still consumes; the source must survive its other consumer's death.
    expect(s.state.isHalted).toBe(false);

    keep.abort(new Error('also gone'));
    await keep.promise.catch(() => {});
    expect(s.state.isHalted).toBe(true);
    await expect(s.promise).rejects.toThrow('also gone');
  });

  test('a consumer draining away is a voluntary detach and does not cascade', async () => {
    const s = streamie((input: number) => input, {});
    const tail = s.map((input) => input);

    tail.drain();
    await tail.promise;

    expect(s.state.isHalted).toBe(false);
  });

  test('an async iterator breaking away does not cascade', async () => {
    const s = streamie((input: number) => input, {});

    const iteration = (async () => {
      for await (const item of s) break;
    })();
    s.push(1);
    await iteration;
    // Iterator detachment is deferred to a microtask; let it complete.
    await delay(0);

    expect(s.state.isHalted).toBe(false);
  });

  test('a mixed history cascades by how the set emptied: final detach by halt', async () => {
    const s = streamie((input: number) => input, {});
    const polite = s.map((input) => input);
    const doomed = s.map((input) => input);

    polite.drain();
    await polite.promise;
    expect(s.state.isHalted).toBe(false);

    // The set empties via a failure, so the cascade applies despite the earlier
    // voluntary departure.
    doomed.abort(new Error('boom'));
    await doomed.promise.catch(() => {});
    expect(s.state.isAborted).toBe(true);
    await expect(s.promise).rejects.toThrow('boom');
  });

  test('a mixed history cascades by how the set emptied: final detach voluntary', async () => {
    const s = streamie((input: number) => input, {});
    const doomed = s.map((input) => input);
    const polite = s.map((input) => input);

    doomed.abort(new Error('boom'));
    await doomed.promise.catch(() => {});
    expect(s.state.isHalted).toBe(false);

    // The set empties via a drain: the source survives consumer-less, retaining
    // any outputs for a later consumer.
    polite.drain();
    await polite.promise;
    expect(s.state.isHalted).toBe(false);
  });

  test('does not echo back when the source itself caused the halt cascade', async () => {
    const s = streamie((input: number) => input, {});
    const tail = s.map((input) => input);

    // Aborting the source cascades downstream to the consumer, whose halt then
    // empties the source's consumer set — but the source is already halted, so the
    // upstream cascade is a guarded no-op and its own abort error is preserved.
    const error = new Error('source down');
    s.abort(error);
    await tail.promise.catch(() => {});

    await expect(s.promise).rejects.toBe(error);
    await expect(tail.promise).rejects.toBe(error);
  });

  test('a deep failure cascades transitively, rejecting every upstream stage', async () => {
    // No stage inspects beyond its direct consumers: the tail's halt aborts mid
    // (its consumer set emptied by a failure), which makes mid a halted consumer of
    // the source, which applies the same rule — induction, not liveness tracking.
    const source = streamie((input: number) => input, {});
    const mid = source.map((input) => input);
    const tail = mid.map(() => { throw new Error('boom'); });

    source.push(1);
    await tail.promise.catch(() => {});

    expect(mid.state.isAborted).toBe(true);
    expect(source.state.isAborted).toBe(true);
    // The root error survives every hop, so a failure deep in a pipeline is
    // observable (as a rejection) from any stage handle, including the head.
    const rejection = await source.promise.then(() => null, (error) => error);
    expect(rejection).toBeInstanceOf(StreamieQueueError);
    expect((rejection as StreamieQueueError<number>).message).toContain('boom');
  });

  test('a bare consumer abort cascades as a bare abort with the generic error', async () => {
    const s = streamie((input: number) => input, {});
    const tail = s.map((input) => input);

    tail.abort();

    expect(s.state.isAborted).toBe(true);
    await expect(s.promise).rejects.toThrow('Streamie was aborted.');
  });

  test('keepAlive: true opts out, retaining outputs and parking on backpressure', async () => {
    // The hub case: a deliberately long-lived source whose ephemeral consumers
    // come, fail, and are replaced. It survives total consumer failure the way it
    // survives having no consumers at all — retaining outputs up to its threshold,
    // with backpressure stalling everything behind it.
    const s = streamie((input: number) => input, { backpressureAt: 2, keepAlive: true });
    const tail = s.map(() => { throw new Error('boom'); });

    s.push(1);
    await tail.promise.catch(() => {});
    for (let item = 2; item <= 10; item++) s.push(item);
    await delay(10);

    expect(s.state.isHalted).toBe(false);
    expect(s.state.count.queued.output).toBe(2);
    expect(s.state.backpressure.input).toBe(true);

    // Still healthy: a replacement consumer attaches and receives the retained
    // backlog plus the remaining items.
    const handled: number[] = [];
    const replacement = s.each((item) => { handled.push(item); });
    s.drain();
    await replacement.promise;
    expect(handled).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

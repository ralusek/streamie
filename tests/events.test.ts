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
    const s = streamie((input: number) => input, {});
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
    }, { backpressureAt: { input: 2 } });

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
    s.map((item) => { handled.push(item); });

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

import streamie from '../src';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('Streamie', () => {
  describe('retry config', () => {
    test('a failing invocation is retried and can succeed', async () => {
      const attempts: number[] = [];
      const s = streamie(async (n: number) => {
        attempts.push(n);
        if (attempts.length < 3) throw new Error(`attempt ${attempts.length} failed`);
        return n * 2;
      }, { retry: 2, sink: true });

      const receipt = s.push.withReceipt(21);
      expect(await receipt.promise).toBe(42);
      expect(attempts).toEqual([21, 21, 21]);
      s.drain();
      await s.promise;
    });

    test('synchronous throwers are retried too', async () => {
      let calls = 0;
      const s = streamie((n: number) => {
        calls++;
        if (calls === 1) throw new Error('sync failure');
        return n;
      }, { retry: 1, sink: true });

      const receipt = s.push.withReceipt(7);
      expect(await receipt.promise).toBe(7);
      expect(calls).toBe(2);
    });

    test('exhausted retries surface the last error through the usual error path', async () => {
      let calls = 0;
      const s = streamie(async () => {
        calls++;
        throw new Error(`failure ${calls}`);
      }, { retry: 2 });

      const receipt = s.push.withReceipt(1);
      await expect(receipt.promise).rejects.toThrow('failure 3');
      await expect(s.promise).rejects.toThrow('failure 3');
      expect(calls).toBe(3); // Original + 2 retries.
    });

    test('a numeric delay waits between attempts', async () => {
      const timestamps: number[] = [];
      const s = streamie(async () => {
        timestamps.push(Date.now());
        if (timestamps.length < 2) throw new Error('not yet');
        return null;
      }, { retry: { attempts: 1, delay: 50 }, sink: true });

      s.push(1);
      s.drain();
      await s.promise;

      expect(timestamps).toHaveLength(2);
      expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(45);
    });

    test('a delay function receives the 1-based attempt number', async () => {
      const delays: number[] = [];
      let calls = 0;
      const s = streamie(async () => {
        calls++;
        if (calls < 4) throw new Error('not yet');
        return null;
      }, {
        retry: {
          attempts: 3,
          delay: (attempt) => { delays.push(attempt); return 0; },
        },
        sink: true,
      });

      s.push(1);
      s.drain();
      await s.promise;

      expect(delays).toEqual([1, 2, 3]);
    });

    test('with haltOnError: false, an exhausted item is recorded and the stream continues', async () => {
      const succeeded: number[] = [];
      const errors: unknown[] = [];
      const s = streamie(async (n: number) => {
        if (n === 2) throw new Error('always fails');
        succeeded.push(n);
        return n;
      }, { retry: 1, haltOnError: false, sink: true });
      s.onError((error) => { errors.push(error); });

      [1, 2, 3].forEach((n) => { s.push.withReceipt(n).promise.catch(() => {}); });
      s.drain();
      await s.promise;

      expect(succeeded).toEqual([1, 3]);
      expect(errors).toHaveLength(1);
    });

    test('is not inherited by chained stages', async () => {
      let downstreamCalls = 0;
      const head = streamie((n: number) => n, { retry: 5 });
      const tail = head.each(() => {
        downstreamCalls++;
        throw new Error('downstream fails');
      });

      head.push(1);
      await expect(tail.promise).rejects.toThrow('downstream fails');
      expect(downstreamCalls).toBe(1);
    });
  });

  describe('timeout config', () => {
    test('an invocation exceeding the timeout fails with a timeout error', async () => {
      const s = streamie(async () => {
        await wait(200);
        return 'too late';
      }, { timeout: 40 });

      const receipt = s.push.withReceipt(1);
      await expect(receipt.promise).rejects.toThrow(/timed out after 40ms/);
      await expect(s.promise).rejects.toThrow(/timed out/);
    });

    test('an invocation inside the window is unaffected', async () => {
      const s = streamie(async (n: number) => {
        await wait(10);
        return n;
      }, { timeout: 500, sink: true });

      const receipt = s.push.withReceipt(5);
      expect(await receipt.promise).toBe(5);
      s.drain();
      await s.promise;
    });

    test('synchronous handlers never time out', async () => {
      const s = streamie((n: number) => n, { timeout: 1, sink: true });
      const receipt = s.push.withReceipt(3);
      expect(await receipt.promise).toBe(3);
    });

    test('a timed-out attempt is retried, and a fast retry recovers', async () => {
      let calls = 0;
      const s = streamie(async (n: number) => {
        calls++;
        if (calls === 1) await wait(200); // First attempt blows the window.
        return n;
      }, { timeout: 40, retry: 1, sink: true });

      const receipt = s.push.withReceipt(9);
      expect(await receipt.promise).toBe(9);
      expect(calls).toBe(2);
    });

    test('the late settlement of a timed-out handler is ignored', async () => {
      const outputs: string[] = [];
      const s = streamie(async () => {
        await wait(60);
        return 'late';
      }, { timeout: 20, haltOnError: false });
      const tail = s.each((v) => { outputs.push(v); });

      s.push.withReceipt(1).promise.catch(() => {});
      await wait(120); // Well past both the timeout and the handler's settlement.
      s.drain();
      await tail.promise;

      expect(outputs).toEqual([]); // The late 'late' was not emitted.
    });
  });
});

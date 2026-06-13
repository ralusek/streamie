import streamie from '../src';
import { StreamieQueueError } from '../src/error';

describe('Push receipts', () => {
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  test('push returns a receipt whose promise resolves with the item\'s output', async () => {
    const s = streamie(async (input: number) => input * 2, {});
    const receipts = [1, 2, 3].map((item) => s.push(item));
    s.drain();

    await expect(Promise.all(receipts.map((receipt) => receipt.promise))).resolves.toEqual([2, 4, 6]);
  });

  test('a synchronous handler\'s receipt resolves with the output', async () => {
    const s = streamie((input: number) => input + 1, {});
    const receipt = s.push(41);
    s.drain();

    await expect(receipt.promise).resolves.toBe(42);
  });

  test('receipts map to their items\' outputs regardless of completion order', async () => {
    const s = streamie(async (input: number) => {
      await delay(input);
      return input * 10;
    }, { concurrency: 3 });
    const receipts = [30, 1, 15].map((item) => s.push(item));
    s.drain();

    await expect(Promise.all(receipts.map((receipt) => receipt.promise))).resolves.toEqual([300, 10, 150]);
  });

  test('a receipt reports the backpressure state the push produced', async () => {
    const s = streamie(async (input: number) => {
      await delay(5);
      return input;
    }, { backpressureAt: { input: 3 }, sink: true });

    expect(s.push(1).backpressure).toBe(false);
    expect(s.push(2).backpressure).toBe(false);
    // The third push brings the input queue to the threshold.
    expect(s.push(3).backpressure).toBe(true);
    expect(s.push(4).backpressure).toBe(true);

    s.drain();
    await s.promise;
  });

  test('a receipt rejects with the StreamieQueueError from its item\'s handler', async () => {
    const s = streamie(async (input: number) => {
      if (input === 2) throw new Error('boom');
      return input;
    }, {});
    const first = s.push(1);
    const second = s.push(2);
    s.drain();

    await expect(first.promise).resolves.toBe(1);
    const error = await second.promise.catch((err) => err);
    expect(error).toBeInstanceOf(StreamieQueueError);
    expect(((error as StreamieQueueError<number>).originalError as Error).message).toBe('boom');

    // The streamie's own promise rejects with the same error.
    await expect(s.promise).rejects.toBe(error);
  });

  test('receipts for items abandoned by a halt reject with the halting error', async () => {
    const s = streamie(async (input: number) => {
      if (input === 1) throw new Error('boom');
      return input;
    }, {});
    // Concurrency 1: item 1 errors and halts the streamie, so 2 and 3 are never handled.
    const receipts = [1, 2, 3].map((item) => s.push(item));

    const errors = await Promise.all(receipts.map(({ promise }) => promise.catch((err) => err)));
    errors.forEach((error) => expect(error).toBeInstanceOf(StreamieQueueError));
    expect(errors[1]).toBe(errors[0]);
    expect(errors[2]).toBe(errors[0]);
  });

  test('unobserved receipts produce no unhandled rejections when the pipeline errors', async () => {
    const unhandled: unknown[] = [];
    const listener = (err: unknown) => { unhandled.push(err); };
    process.on('unhandledRejection', listener);
    try {
      const s = streamie(async () => {
        throw new Error('boom');
      }, {});
      // Receipts discarded without their promises ever being accessed.
      [1, 2, 3].forEach((item) => s.push(item));
      await delay(20);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', listener);
    }
  });

  test('a receipt accessed only after settlement still resolves', async () => {
    const s = streamie((input: number) => input * 2, { sink: true });
    const receipt = s.push(5);
    s.drain();
    await s.promise;

    await expect(receipt.promise).resolves.toBe(10);
  });

  test('a receipt accessed only after a halt still rejects', async () => {
    const s = streamie(() => {
      throw new Error('boom');
    }, {});
    s.push(1);
    const abandoned = s.push(2);
    await s.promise.catch(() => {});

    const error = await abandoned.promise.catch((err) => err);
    expect(error).toBeInstanceOf(StreamieQueueError);
  });

  test('filter-stage receipts resolve with the item itself, whether or not it passed', async () => {
    const head = streamie((input: number) => input, {});
    const evens = head.filter((input) => input % 2 === 0);

    // 1 is filtered out, 2 passes; both receipts resolve once their item has been
    // processed, with the item itself.
    const receipts = [1, 2].map((item) => evens.push(item));
    await expect(Promise.all(receipts.map((receipt) => receipt.promise))).resolves.toEqual([1, 2]);
  });

  test('batch-stage receipts each resolve with the batch their item joined', async () => {
    const head = streamie((input: number) => input, {});
    const batched = head.batch(2);

    const receipts = [1, 2].map((item) => batched.push(item));
    const outputs = await Promise.all(receipts.map((receipt) => receipt.promise));
    expect(outputs[0]).toEqual([1, 2]);
    // Both items were handled by the same invocation, so they share a resolution.
    expect(outputs[1]).toBe(outputs[0]);
  });

  test('receipts stay aligned when direct pushes interleave with upstream deliveries', async () => {
    const head = streamie((input: number) => input, {});
    const next = head.map(async (input) => {
      await delay(5);
      return input * 10;
    });
    const seen: number[] = [];
    const tail = next.each((value) => { seen.push(value); });

    [1, 2, 3].forEach((item) => head.push(item));
    // Let head's synchronous handler run so its outputs are already queued in next's
    // input — receiptless — before the direct push activates receipt tracking and
    // backfills their slots.
    await delay(1);
    const receipt = next.push(100);
    head.drain();

    await expect(receipt.promise).resolves.toBe(1000);
    await tail.promise;
    expect(seen).toEqual([10, 20, 30, 1000]);
  });
});

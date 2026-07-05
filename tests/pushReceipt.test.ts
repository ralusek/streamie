import streamie from '../src';
import { StreamieQueueError } from '../src/error';

describe('Push receipts', () => {
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  test('push.withReceipt returns a receipt whose promise resolves with the item\'s output', async () => {
    const s = streamie(async (input: number) => input * 2, {});
    const receipts = [1, 2, 3].map((item) => s.push.withReceipt(item));
    s.drain();

    await expect(Promise.all(receipts.map((receipt) => receipt.promise))).resolves.toEqual([2, 4, 6]);
  });

  test('a synchronous handler\'s receipt resolves with the output', async () => {
    const s = streamie((input: number) => input + 1, {});
    const receipt = s.push.withReceipt(41);
    s.drain();

    await expect(receipt.promise).resolves.toBe(42);
  });

  test('receipts map to their items\' outputs regardless of completion order', async () => {
    const s = streamie(async (input: number) => {
      await delay(input);
      return input * 10;
    }, { concurrency: 3 });
    const receipts = [30, 1, 15].map((item) => s.push.withReceipt(item));
    s.drain();

    await expect(Promise.all(receipts.map((receipt) => receipt.promise))).resolves.toEqual([300, 10, 150]);
  });

  test('a receipt reports the backpressure state the push produced', async () => {
    const s = streamie(async (input: number) => {
      await delay(5);
      return input;
    }, { backpressureAt: { input: 3 }, sink: true });

    expect(s.push.withReceipt(1).backpressure).toBe(false);
    expect(s.push.withReceipt(2).backpressure).toBe(false);
    // The third push brings the input queue to the threshold.
    expect(s.push.withReceipt(3).backpressure).toBe(true);
    expect(s.push.withReceipt(4).backpressure).toBe(true);

    s.drain();
    await s.promise;
  });

  test('a receipt rejects with the StreamieQueueError from its item\'s handler', async () => {
    const s = streamie(async (input: number) => {
      if (input === 2) throw new Error('boom');
      return input;
    }, {});
    const first = s.push.withReceipt(1);
    const second = s.push.withReceipt(2);
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
    const receipts = [1, 2, 3].map((item) => s.push.withReceipt(item));

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
      [1, 2, 3].forEach((item) => s.push.withReceipt(item));
      await delay(20);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', listener);
    }
  });

  test('a receipt accessed only after settlement still resolves', async () => {
    const s = streamie((input: number) => input * 2, { sink: true });
    const receipt = s.push.withReceipt(5);
    s.drain();
    await s.promise;

    await expect(receipt.promise).resolves.toBe(10);
  });

  test('a receipt accessed only after a halt still rejects', async () => {
    const s = streamie(() => {
      throw new Error('boom');
    }, {});
    s.push(1);
    const abandoned = s.push.withReceipt(2);
    await s.promise.catch(() => {});

    const error = await abandoned.promise.catch((err) => err);
    expect(error).toBeInstanceOf(StreamieQueueError);
  });

  test('filter-stage receipts resolve with the item itself, whether or not it passed', async () => {
    const head = streamie((input: number) => input, {});
    const evens = head.filter((input) => input % 2 === 0);

    // 1 is filtered out, 2 passes; both receipts resolve once their item has been
    // processed, with the item itself.
    const receipts = [1, 2].map((item) => evens.push.withReceipt(item));
    await expect(Promise.all(receipts.map((receipt) => receipt.promise))).resolves.toEqual([1, 2]);
  });

  test('batch-stage receipts each resolve with the batch their item joined', async () => {
    const head = streamie((input: number) => input, {});
    const batched = head.batch(2);

    const receipts = [1, 2].map((item) => batched.push.withReceipt(item));
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
    const receipt = next.push.withReceipt(100);
    head.drain();

    await expect(receipt.promise).resolves.toBe(1000);
    await tail.promise;
    expect(seen).toEqual([10, 20, 30, 1000]);
  });

  test('batched receipts stay aligned when direct pushes interleave with upstream deliveries', async () => {
    // Exercises the shiftMany alignment path: a batch dequeues its items and their
    // (maybe-)receipts in one bite, mixing receiptless upstream slots with receipted
    // direct pushes.
    const head = streamie((input: number) => input, {});
    const batched = head.batch(3);
    const collected: number[][] = [];
    const tail = batched.each((batch) => { collected.push(batch); });

    // Two upstream items arrive via delivery (receiptless) and, at fewer than a full
    // batch, wait in batched's input queue.
    head.push(1);
    head.push(2);
    await delay(1);
    expect(batched.state.count.queued.input).toBe(2);

    // The first direct push activates receipt tracking, backfilling the two
    // receiptless slots, and completes the first batch; the second direct push plus
    // two more upstream deliveries form the second batch, so alignment is exercised
    // across the batch boundary in both slot orders.
    const receiptA = batched.push.withReceipt(100);
    const receiptB = batched.push.withReceipt(200);
    head.push(3);
    head.push(4);
    head.drain();

    await expect(receiptA.promise).resolves.toEqual([1, 2, 100]);
    await expect(receiptB.promise).resolves.toEqual([200, 3, 4]);
    await tail.promise;
    expect(collected).toEqual([[1, 2, 100], [200, 3, 4]]);
  });

  test('a receipt\'s promise is a single instance across accesses, before and after settlement', async () => {
    // Accessed while pending: repeated access returns the same lazily created promise.
    const s = streamie(async (input: number) => input * 2, { sink: true });
    const receipt = s.push.withReceipt(21);
    const first = receipt.promise;
    expect(receipt.promise).toBe(first);
    s.drain();
    await s.promise;
    // Still the same instance after settlement, and it carries the resolution.
    expect(receipt.promise).toBe(first);
    await expect(first).resolves.toBe(42);

    // Accessed only after settlement: the first access materializes the promise, and
    // later accesses return that same instance rather than minting new ones.
    const late = streamie((input: number) => input + 1, { sink: true });
    const lateReceipt = late.push.withReceipt(1);
    late.drain();
    await late.promise;
    const lateFirst = lateReceipt.promise;
    expect(lateReceipt.promise).toBe(lateFirst);
    await expect(lateFirst).resolves.toBe(2);
  });
});

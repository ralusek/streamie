/************************/
/******* IMPORTANT ******/
/************************/
// Note: These tests are fundamentally imperfect because JS memory management is non-deterministic.
// We rely on the garbage collector to clean up memory, but we can't control when it runs.
// What *is* generally true, about these tests, however, is that they are virtually incapable of passing
// if there *is* a memory leak. i.e. no false negatives.
// What is possible, however, are false positives, where the test fails because the garbage collector
// hasn't run yet, and the memory increase is due to memory that simply hasn't been cleaned up yet,
// rather than being fundamentally tied up in a memory leak.

import streamie from '../src';

const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit';

describe('streamie memory usage', () => {
  it('should have increasing memory usage when adding indefinite referenced streamies', async () => {
    const REST = 50;
    const checkForLeak = getMemoryLeakTester({ label: 'adding indefinite referenced streamies', maxIncreasedCount: 10, restForGC: REST, increaseThreshold: 0.1 });
    const streamies: any[] = [];
    let error: any;
    // const ITERATIONS = 2_000_000;
    const ITERATIONS = 200_000;
    const CHECK_INTERVAL = 10_000;
    try {
      for (let i = 0; i < ITERATIONS; i++) {
        const newStreamie = streamie(() => Promise.resolve('test'), {});
        streamies.push(newStreamie);
        if ((i > 10_000) && ((i % CHECK_INTERVAL) === 0)) {
          expect(streamies.length).toEqual(i + 1);
          await checkForLeak(); // will wait 50ms
        }
      }
    }
    catch(err) {
      error = err;
    }
    
    expect(error.message).toMatch(/Memory Leak "adding indefinite referenced streamies" detected/);

  }, 1000 * 60);

  it('should not keep increasing memory if streamies are not kept referenced', async () => {
    const REST = 50;
    const checkForLeak = getMemoryLeakTester({ label: 'adding indefinite unreferenced streamies', maxIncreasedCount: 10, restForGC: REST, increaseThreshold: 0.1 });
    let error: any;
    const ITERATIONS = 200_000;
    const CHECK_INTERVAL = 10_000;
    try {
      for (let i = 0; i < ITERATIONS; i++) {
        streamie(() => Promise.resolve('test'), {});
        if ((i > 10_000) && ((i % CHECK_INTERVAL) === 0)) {
          await checkForLeak(); // will wait 50ms
        }
      }
    }
    catch(err) {
      error = err;
    }
    
    expect(error).toBeUndefined();
    // expect(error.message).toMatch(/Memory Leak "adding indefinite keys" detected/);

  }, 1000 * 60);

  it('should not keep increasing memory if streamies are not kept referenced, even with promises', async () => {
    const REST = 50;
    const checkForLeak = getMemoryLeakTester({ label: 'adding indefinite unreferenced streamies and promises', maxIncreasedCount: 10, restForGC: REST, increaseThreshold: 0.1 });
    let error: any;
    const ITERATIONS = 200_000;
    const CHECK_INTERVAL = 10_000;
    try {
      for (let i = 0; i < ITERATIONS; i++) {
        streamie(() => Promise.resolve('test'), {}).promise; // Getter for promise lazily creates a promise
        if ((i > 10_000) && ((i % CHECK_INTERVAL) === 0)) {
          await checkForLeak(); // will wait 50ms
        }
      }
    }
    catch(err) {
      error = err;
    }
    
    expect(error).toBeUndefined();
    // expect(error.message).toMatch(/Memory Leak "adding indefinite keys" detected/);

  }, 1000 * 60);

  it('should not keep increasing memory if streamies are not kept referenced, even with complex references', async () => {
    const REST = 50;
    const checkForLeak = getMemoryLeakTester({ label: 'adding indefinite unreferenced streamies and complex references', maxIncreasedCount: 10, restForGC: REST, increaseThreshold: 0.1 });
    let error: any;
    const ITERATIONS = 300_000;
    const CHECK_INTERVAL = 10_000;
    try {
      for (let i = 0; i < ITERATIONS; i++) {
        const newStreamie = streamie(async (x: number) => x * 2, {})
        
        const behaviors = newStreamie.map((x) => x * 3, {})
        .filter(() => true, {});

        newStreamie.push(1, 2, 3);
        newStreamie.drain();

        if ((i > 10_000) && ((i % CHECK_INTERVAL) === 0)) {
          await behaviors.promise; // Even though we're not awaiting the vast majority, stopping to await one every now and then should be enough
          await checkForLeak(); // will wait 50ms
        }
      }
    }
    catch(err) {
      error = err;
    }
    
    expect(error).toBeUndefined();
    // expect(error.message).toMatch(/Memory Leak "adding indefinite keys" detected/);

  }, 1000 * 60);

  it('should have increasing memory usage when pushing large amount of referenced items', async () => {
    const REST = 50;
    const checkForLeak = getMemoryLeakTester({ label: 'pushing large amount of referenced items', maxIncreasedCount: 20, restForGC: REST, increaseThreshold: 0.2 });
    const items: any[] = [];
    const ITERATIONS = 2_000_000;
    const CHECK_INTERVAL = 10_000;

    const newStreamie = streamie(async (x: number) => x * 2, {});

    const ops = newStreamie
    .map(async (x) => x * 3, {})
    .filter(async (x) => x % 2 === 0, {})
    .map(async ([x1, x2]) => {
      const result = (x1 + x2) * 4;
      items.push({ result, x1, x2, memoryWasting: new Array(1000).fill(LOREM) });
      return result;
    }, { batchSize: 2 });

    let error: any;
    try {
      for (let i = 0; i < ITERATIONS; i++) {
        newStreamie.push(1);
        if ((i > 10_000) && ((i % CHECK_INTERVAL) === 0)) {
          await checkForLeak(150); // will wait 50ms
          expect(items.length).toEqual((i / 2));
        }
      }
    }
    catch(err) {
      error = err;
    }
    
    expect(error.message).toMatch(/Memory Leak "pushing large amount of referenced items" detected/);
  }, 1000 * 60);

  it('should not keep increasing memory when pushing large amount of unreferenced items ', async () => {
    const REST = 50;
    const checkForLeak = getMemoryLeakTester({ label: 'pushing large amount of unreferenced items', maxIncreasedCount: 20, restForGC: REST, increaseThreshold: 0.2 });
    const ITERATIONS = 2_000_000;
    const CHECK_INTERVAL = 10_000;
    let amount = 0;

    const newStreamie = streamie(async (x: number) => x * 2, {});

    const ops = newStreamie
    .map(async (x) => x * 3, {})
    .filter(async (x) => x % 2 === 0, {})
    .map(async ([x1, x2]) => {
      const result = (x1 + x2) * 4;
      amount++;
      return { result, x1, x2, memoryWasting: new Array(1000).fill(LOREM) }
    }, { batchSize: 2 })
    .map(async (x) => x.result, {});

    let error: any;
    try {
      for (let i = 0; i < ITERATIONS; i++) {
        newStreamie.push(1);
        if ((i > 10_000) && ((i % CHECK_INTERVAL) === 0)) {
          await checkForLeak(150); // will wait 50ms
          expect(amount).toEqual((i / 2));
        }
      }
    }
    catch(err) {
      error = err;
    }

    newStreamie.drain();

    await ops.promise;
    
    expect(error).toBeUndefined();
  }, 1000 * 60 * 2);
});

function awaitTimeout(timeout: number) {
  return new Promise((resolve) => setTimeout(() => resolve(null), timeout));
}

type Config = {
  label: string;
  maxIncreasedCount?: number;
  restForGC?: number;
  // The percentage over the initial memory usage that is considered a leak
  increaseThreshold?: number;
};

function getMemoryLeakTester({
  label,
  // Number of times the memory usage can increase by the threshold before we should
  // consider it a leak
  maxIncreasedCount = 10,
  restForGC = 100,
  increaseThreshold = 0.1,
}: Config) {
  // Starting memory usage that will be used as a baseline
  const starting = getMemoryUsage();
  // The amount of memory usage over which an increment is counted over the previous threshold.
  // For example, if our starting usage is 10, the increaseThreshold is 0.1, then the increaseThresholdValue
  // is 1. This means that at 11, we will have counted 1 increase, if we encounter a value at 11.5, nothing happens
  // at 12, we have counted 2 increases, and so on.
  const increaseThresholdValue = starting * increaseThreshold;
  // The maximum memory usage we have encountered so far
  let max = starting;
  // The last memory usage checkpoint at which we incremented our count
  let lastThresholdBreach = starting;
  const startTime = Date.now();
  let increasedCount = 0;
  
  return async function checkForLeak(rest?: number) {
    await awaitTimeout(rest ?? restForGC);

    const used = getMemoryUsage();
    console.log('Memory usage', used, starting, increaseThresholdValue, lastThresholdBreach, increasedCount);
    if (used > max) {
      max = used;
      const diff = used - lastThresholdBreach;
      const surpassedThreshold = diff > increaseThresholdValue;
      if (surpassedThreshold) {
        lastThresholdBreach = used;
        if (++increasedCount > maxIncreasedCount) throw new Error(`Memory Leak "${label}" detected, with a total increase of ${used - starting} over ${(Date.now() - startTime) / 1000} seconds.`);
      }
    }
  };
}

// Get memory usage in MB
function getMemoryUsage() {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

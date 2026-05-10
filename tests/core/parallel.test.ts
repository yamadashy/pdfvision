import { describe, expect, it } from 'vitest';
import { defaultConcurrency, runParallel } from '../../src/core/parallel.js';

describe('defaultConcurrency', () => {
  it('returns a positive integer no larger than the 8-task ceiling', () => {
    // The cap exists to bound peak memory when many pages are
    // rasterised in parallel. Below 1 would deadlock the runner.
    const c = defaultConcurrency();
    expect(c).toBeGreaterThanOrEqual(1);
    expect(c).toBeLessThanOrEqual(8);
    expect(Number.isInteger(c)).toBe(true);
  });
});

describe('runParallel', () => {
  it('preserves input order in the result array', async () => {
    // Sleep durations vary inversely with index so later items finish
    // earlier wall-clock — if the runner accidentally pushed by completion
    // order rather than indexing, this test would catch it.
    const items = [0, 1, 2, 3, 4, 5];
    const results = await runParallel(
      items,
      async (item) => {
        await new Promise((resolve) => setTimeout(resolve, (items.length - item) * 5));
        return item * 10;
      },
      4,
    );
    expect(results).toEqual([0, 10, 20, 30, 40, 50]);
  });

  it('caps in-flight tasks at the requested concurrency', async () => {
    let inFlight = 0;
    let peak = 0;
    await runParallel(
      Array.from({ length: 20 }, (_, i) => i),
      async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        return null;
      },
      3,
    );
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1); // sanity: actually ran in parallel
  });

  it('returns an empty array for an empty input without invoking the worker', async () => {
    let calls = 0;
    const results = await runParallel<number, number>([], async () => {
      calls++;
      return 0;
    });
    expect(results).toEqual([]);
    expect(calls).toBe(0);
  });

  it('rejects with the first thrown error and stops scheduling new work', async () => {
    // Index 1 throws after 5ms. Indexes 0/2/3/4 are scheduled but later
    // indexes (≥ 5) must not start once the failure has been observed.
    let started = 0;
    await expect(
      runParallel(
        Array.from({ length: 20 }, (_, i) => i),
        async (idx) => {
          started++;
          await new Promise((resolve) => setTimeout(resolve, idx === 1 ? 5 : 50));
          if (idx === 1) throw new Error('boom');
          return idx;
        },
        2,
      ),
    ).rejects.toThrow(/boom/);
    // With concurrency 2, the failure at idx=1 fires before idx=10+ get
    // the chance to start. A no-cancellation runner would start every
    // task; the failure-flag short-circuit keeps that count well below 20.
    expect(started).toBeLessThan(20);
  });
});

import { availableParallelism } from 'node:os';

/**
 * Cap on internal page-level concurrency. Each rendered page holds a
 * full RGBA canvas in memory (a 2x A4 ≈ 8 MB), so we don't want to
 * spawn 32+ in parallel just because the box has 32 cores. Eight is a
 * pragmatic ceiling that keeps peak memory bounded while still saturating
 * the I/O- and PDF-decode-bound stages on most laptops.
 */
const MAX_CONCURRENCY = 8;

/**
 * Default concurrency for page-level parallelism. `os.availableParallelism()`
 * (Node 18.14+) reflects the cores actually usable by this process —
 * including container CPU limits, taskset masks, and Windows job objects —
 * which is more accurate than `os.cpus().length` for cloud / CI environments.
 */
export function defaultConcurrency(): number {
  const cpu = typeof availableParallelism === 'function' ? availableParallelism() : 4;
  return Math.max(1, Math.min(cpu, MAX_CONCURRENCY));
}

/**
 * Run `worker` over `items` with at most `concurrency` tasks in flight,
 * preserving input order in the returned array. Each runner pulls the
 * next pending index from a shared cursor (work-stealing), so a slow
 * page doesn't stall the rest of the queue behind it.
 *
 * If any worker throws, the overall promise rejects with that error. In-
 * flight runners continue draining their current tasks (Promise.all has
 * no cancellation), but no new work is started after a rejection bubbles.
 * Page extraction is read-only, so leftover work either writes its result
 * into the discarded array slot or no-ops on a cache check; neither path
 * leaves a half-written file.
 */
export async function runParallel<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency: number = defaultConcurrency(),
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  if (items.length === 0) return results;
  const limit = Math.max(1, Math.min(concurrency, items.length));

  let next = 0;
  let failure: unknown;
  const runners = Array.from({ length: limit }, async () => {
    while (failure === undefined) {
      const idx = next++;
      if (idx >= items.length) return;
      try {
        results[idx] = await worker(items[idx], idx);
      } catch (error) {
        failure = error;
        throw error;
      }
    }
  });

  // Promise.all rejects on the first runner that throws; the remaining
  // runners observe `failure` set and exit at their next loop iteration
  // instead of starting new tasks.
  await Promise.all(runners);
  return results;
}

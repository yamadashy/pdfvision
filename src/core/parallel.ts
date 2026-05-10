import { availableParallelism, cpus } from 'node:os';

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
 * Falls back to `cpus().length` when the newer API is missing, and finally
 * to a literal `4` so the runner always has a sane positive concurrency.
 */
export function defaultConcurrency(): number {
  const cpu = typeof availableParallelism === 'function' ? availableParallelism() : (cpus?.().length ?? 4);
  return Math.max(1, Math.min(cpu, MAX_CONCURRENCY));
}

/**
 * Run `worker` over `items` with at most `concurrency` tasks in flight,
 * preserving input order in the returned array. Each runner pulls the
 * next pending index from a shared cursor (work-stealing), so a slow
 * task doesn't stall the rest of the queue behind it.
 *
 * If any worker rejects, the overall promise rejects with the first
 * error observed. No new tasks are scheduled once the failure flag is
 * set, but in-flight tasks continue to settle (Promise.all has no
 * cancellation). Late rejections from sibling runners are absorbed
 * inside the runner itself so they cannot escape as
 * `UnhandledPromiseRejection` once the first failure has already been
 * captured.
 *
 * Callers are responsible for ensuring partial / discarded results are
 * safe to drop on rejection — e.g. pdfjs page extraction is read-only,
 * `atomicWrite` makes PNG renders self-cleaning on partial failure.
 */
export async function runParallel<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency: number = defaultConcurrency(),
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  if (items.length === 0) return results;
  // Math.floor handles non-integer concurrency (1.5 → 1); the `|| 1`
  // catches NaN / 0 fallthroughs so we always run at least one task.
  const limit = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length));

  let next = 0;
  let hasFailed = false;
  let firstError: unknown;
  const runners = Array.from({ length: limit }, async () => {
    while (!hasFailed) {
      const idx = next++;
      if (idx >= items.length) return;
      try {
        results[idx] = await worker(items[idx], idx);
      } catch (error) {
        // Trap inside the runner so a late rejection from a sibling
        // doesn't escape as UnhandledPromiseRejection once Promise.all
        // has already resolved on the earlier failure. Keep only the
        // first error — the caller's contract is "rejects with the
        // first observed error".
        if (!hasFailed) {
          hasFailed = true;
          firstError = error;
        }
        return;
      }
    }
  });

  await Promise.all(runners);
  if (hasFailed) throw firstError;
  return results;
}

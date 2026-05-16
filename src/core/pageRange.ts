export function parsePageRange(range: string, totalPages: number): number[] {
  return parsePageRangeWithSkipped(range, totalPages).pages;
}

/**
 * Cap on how many out-of-range page numbers we enumerate in `skipped`.
 * A user typing `--pages 1-1000000000` against a 30-page doc would
 * otherwise OOM the process building a 10^9-entry Set; the cap stops
 * that without losing the signal — the warning still shows the first
 * N skipped numbers via `skipped` and tells the caller more were
 * truncated via `skippedTruncated`.
 */
const MAX_TRACKED_SKIPPED = 100;

/**
 * Same parse rules as {@link parsePageRange}, but also reports which
 * page numbers in the request fell outside `1..totalPages`. processor
 * uses the `skipped` list to emit a warning so callers don't silently
 * miss the trailing pages of e.g. `--pages 1-3,5` against a 4-page
 * document. Pure parser — no side effects.
 *
 * `skippedTruncated` is `true` when the request named more than
 * {@link MAX_TRACKED_SKIPPED} out-of-range pages; in that case
 * `skipped` carries the first {@link MAX_TRACKED_SKIPPED} only. This
 * caps memory on adversarial inputs (`--pages 1-1000000000`) while
 * still surfacing the head of the out-of-range run.
 */
export function parsePageRangeWithSkipped(
  range: string,
  totalPages: number,
): { pages: number[]; skipped: number[]; skippedTruncated: boolean } {
  const pages = new Set<number>();
  const skipped = new Set<number>();
  let skippedTruncated = false;

  for (const part of range.split(',')) {
    const trimmed = part.trim();
    if (trimmed === '') {
      throw new Error(`Invalid --pages "${range}": empty segment`);
    }

    if (trimmed.includes('-')) {
      const segments = trimmed.split('-');
      if (segments.length !== 2) {
        throw new Error(`Invalid --pages "${range}": malformed range "${trimmed}"`);
      }
      const start = Number(segments[0]);
      const end = Number(segments[1]);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1 || start > end) {
        throw new Error(`Invalid --pages "${range}": malformed range "${trimmed}"`);
      }
      // Enumerate in-range pages directly; for the out-of-range tail we
      // stop as soon as the cap is hit so an absurd upper bound
      // (`1-1000000000`) doesn't burn memory on numbers we'd never use.
      const inRangeEnd = Math.min(end, totalPages);
      for (let i = start; i <= inRangeEnd; i++) pages.add(i);
      if (end > totalPages) {
        const outRangeStart = Math.max(start, totalPages + 1);
        for (let i = outRangeStart; i <= end; i++) {
          if (skipped.size >= MAX_TRACKED_SKIPPED) {
            skippedTruncated = true;
            break;
          }
          skipped.add(i);
        }
      }
    } else {
      const num = Number(trimmed);
      if (!Number.isInteger(num) || num < 1) {
        throw new Error(`Invalid --pages "${range}": "${trimmed}" is not a positive integer`);
      }
      if (num <= totalPages) {
        pages.add(num);
      } else if (skipped.size >= MAX_TRACKED_SKIPPED) {
        skippedTruncated = true;
      } else {
        skipped.add(num);
      }
    }
  }

  if (pages.size === 0) {
    throw new Error(`Invalid --pages "${range}": no pages selected (document has ${totalPages} page(s))`);
  }

  return {
    pages: [...pages].sort((a, b) => a - b),
    skipped: [...skipped].sort((a, b) => a - b),
    skippedTruncated,
  };
}

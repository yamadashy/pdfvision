export function parsePageRange(range: string, totalPages: number): number[] {
  return parsePageRangeWithSkipped(range, totalPages).pages;
}

/**
 * Same parse rules as {@link parsePageRange}, but also reports which
 * page numbers in the request fell outside `1..totalPages`. processor
 * uses the `skipped` list to emit a stderr warning so callers don't
 * silently miss the trailing pages of e.g. `--pages 1-3,5` against a
 * 4-page document. Pure parser — no side effects.
 */
export function parsePageRangeWithSkipped(range: string, totalPages: number): { pages: number[]; skipped: number[] } {
  const pages = new Set<number>();
  const skipped = new Set<number>();

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
      for (let i = start; i <= end; i++) {
        if (i <= totalPages) pages.add(i);
        else skipped.add(i);
      }
    } else {
      const num = Number(trimmed);
      if (!Number.isInteger(num) || num < 1) {
        throw new Error(`Invalid --pages "${range}": "${trimmed}" is not a positive integer`);
      }
      if (num <= totalPages) pages.add(num);
      else skipped.add(num);
    }
  }

  if (pages.size === 0) {
    throw new Error(`Invalid --pages "${range}": no pages selected (document has ${totalPages} page(s))`);
  }

  return {
    pages: [...pages].sort((a, b) => a - b),
    skipped: [...skipped].sort((a, b) => a - b),
  };
}

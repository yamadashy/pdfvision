/** Collapse a page-number list into `1-3, 7, 12-40` so long runs cost a few tokens instead of hundreds. */
export function formatPageRanges(pages: readonly number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  if (sorted.length === 0) return '';

  const parts: string[] = [];
  let start = sorted[0] as number;
  let previous = start;
  for (const page of sorted.slice(1)) {
    if (page === previous + 1) {
      previous = page;
      continue;
    }
    parts.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = page;
    previous = page;
  }
  parts.push(start === previous ? `${start}` : `${start}-${previous}`);
  return parts.join(', ');
}

export function parsePageRange(range: string, totalPages: number): number[] {
  const pages = new Set<number>();

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
      for (let i = start; i <= Math.min(end, totalPages); i++) {
        pages.add(i);
      }
    } else {
      const num = Number(trimmed);
      if (!Number.isInteger(num) || num < 1) {
        throw new Error(`Invalid --pages "${range}": "${trimmed}" is not a positive integer`);
      }
      if (num <= totalPages) pages.add(num);
    }
  }

  if (pages.size === 0) {
    throw new Error(`Invalid --pages "${range}": no pages selected (document has ${totalPages} page(s))`);
  }

  return [...pages].sort((a, b) => a - b);
}

import type { LayoutLine } from '../../types/index.js';

/**
 * Line building keeps a row of short, widely spaced words on one line
 * (`S P A C E D` titles, letter-spaced headings) even across a gap that
 * would otherwise split it. A table header row (`Depot  Region  Planned`)
 * has the same shape, and table detection needs its words as separate
 * cells. The segments the line would have split into are kept here, keyed
 * by the line object, so the reading text stays as it is.
 */
const segmentsByLine = new WeakMap<LayoutLine, LayoutLine[]>();

export function recordGutterSegments(line: LayoutLine, segments: LayoutLine[]): void {
  // Single letters set far apart are letter-spacing or stacked subscripts
  // (`V` `O L S`), not words that could each head a column.
  if (segments.length < 2 || segments.some((segment) => [...segment.text.trim()].length < 2)) return;
  segmentsByLine.set(line, segments);
}

/** The lines table detection sees: each line, or the segments it joined across a gutter. */
export function linesAsTableCells(lines: readonly LayoutLine[]): LayoutLine[] {
  return lines.flatMap((line) => segmentsByLine.get(line) ?? [line]);
}

/** Split `items` before every item in `splitBefore`. */
export function splitAtSpans<T>(items: readonly T[], splitBefore: ReadonlySet<T>): T[][] {
  const parts: T[][] = [];
  for (const item of items) {
    const last = parts.at(-1);
    if (last && !splitBefore.has(item)) last.push(item);
    else parts.push([item]);
  }
  return parts;
}

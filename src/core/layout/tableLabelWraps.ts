import type { LayoutLine } from '../../types/index.js';
import { isTableNumericCell, isTableValueCell } from './tableCells.js';
import { mergeLineTexts, rowBottom, rowY } from './tableRows.js';

/** Label-only lines that wrap from the table row at `index`. */
export interface CarriedLabelLines {
  index: number;
  lines: LayoutLine[];
}

const WRAP_ALIGN_MIN_TOLERANCE_PT = 12;
const WRAP_ALIGN_FONT_SIZE_RATIO = 2;
const WRAP_GAP_MAX_RATIO = 0.6;
const WRAP_GAP_MIN_DIFFERENCE_PT = 2;

/**
 * A multi-line label sets its values on one of its lines: the first in most
 * tables (an invoice item), the last in financial statements. The lines of
 * one cell are set at the line pitch while rows are padded apart, so label
 * lines clearly closer to the row above than to the row below are the tail
 * of the label above. When the two gaps are alike nothing on the page tells
 * them apart, and the lines stay with the row below, as statements set them.
 */
export function wrapsFromRowAbove(
  above: readonly LayoutLine[],
  continuations: readonly LayoutLine[],
  below: readonly LayoutLine[],
): boolean {
  const aboveLabel = firstLabelCell(above);
  const first = continuations[0];
  const last = continuations.at(-1);
  if (!aboveLabel || !first || !last || !above.some((line) => isTableValueCell(line.text))) return false;
  if (!isAlignedLabelLine(first, aboveLabel)) return false;
  const gapAbove = first.y - rowBottom([...above]);
  const gapBelow = rowY([...below]) - (last.y + last.height);
  return isClearlyCloser(gapAbove, gapBelow);
}

/** Whether `near` is clearly the smaller of two vertical gaps, not just by rounding. */
export function isClearlyCloser(near: number, far: number): boolean {
  return far - near >= WRAP_GAP_MIN_DIFFERENCE_PT && near <= far * WRAP_GAP_MAX_RATIO;
}

/** Whether `line` starts in the same label column as `label`. */
export function isAlignedLabelLine(line: LayoutLine, label: LayoutLine): boolean {
  return (
    Math.abs(line.x - label.x) <= Math.max(WRAP_ALIGN_MIN_TOLERANCE_PT, label.fontSize * WRAP_ALIGN_FONT_SIZE_RATIO)
  );
}

/** Fold each row's `carriedUp` lines into the label of the table row they wrap from. */
export function foldCarriedLabelLines<T extends { row: LayoutLine[]; index: number; carriedUp?: CarriedLabelLines }>(
  rows: T[],
): T[] {
  const carried = new Map<number, LayoutLine[]>();
  for (const { carriedUp } of rows) {
    if (carriedUp) carried.set(carriedUp.index, carriedUp.lines);
  }
  if (carried.size === 0) return rows;
  return rows.map((item) => {
    const lines = carried.get(item.index);
    const label = lines ? firstLabelCell(item.row) : undefined;
    if (!lines || !label) return item;
    const merged = mergeLineTexts([label, ...lines]);
    return { ...item, row: item.row.map((line) => (line === label ? merged : line)) };
  });
}

function firstLabelCell(row: readonly LayoutLine[]): LayoutLine | undefined {
  return row.find((line) => !isTableNumericCell(line.text) && /[\p{L}]/u.test(line.text));
}

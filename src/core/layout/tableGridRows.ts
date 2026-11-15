import type { LayoutLine } from '../../types/index.js';
import { isCompactTableLabelCell } from './tableCandidateRows.js';
import { isTableValueCell } from './tableCells.js';
import { medianNumber } from './tableColumnStats.js';
import { rowY } from './tableRows.js';

interface Extent {
  left: number;
  right: number;
}

const TEXT_GRID_ROW_MAX_PITCH_RATIO = 2;
const TEXT_GRID_ROW_MIN_COLUMNS = 2;
const TEXT_GRID_ROW_MIN_COLUMN_RATIO = 0.5;

/**
 * The value columns of a table's rows: the horizontal extents its value
 * cells cover, overlapping extents merged.
 */
export function valueColumnExtents(rows: readonly LayoutLine[][]): Extent[] {
  const extents = rows
    .flatMap((row) => row.filter((line) => isTableValueCell(line.text)))
    .map((line) => ({ left: line.x, right: line.x + line.width }))
    .sort((a, b) => a.left - b.left);
  const merged: Extent[] = [];
  for (const extent of extents) {
    const last = merged.at(-1);
    if (last && extent.left < last.right) last.right = Math.max(last.right, extent.right);
    else merged.push({ ...extent });
  }
  return merged;
}

/** Median distance from one row's top to the next row's top. */
export function rowPitch(rows: readonly LayoutLine[][]): number {
  const tops = rows.map(rowY).sort((a, b) => a - b);
  return medianNumber(tops.slice(1).map((top, index) => top - tops[index]));
}

/**
 * A row of the same grid whose values are words (`Yes | No | Yes`): every
 * cell right of an optional label sits in exactly one value column, one
 * cell per column, covering at least half of the columns, and the row
 * follows the previous row at the table's row pitch. Candidate detection
 * needs digits, so without this the row would be silently left out of a
 * table it continues.
 */
export function isTextGridRow(
  row: readonly LayoutLine[],
  previous: readonly LayoutLine[],
  columns: readonly Extent[],
  pitch: number,
): boolean {
  const firstColumn = columns[0];
  if (!firstColumn || columns.length < TEXT_GRID_ROW_MIN_COLUMNS || pitch <= 0) return false;
  if (rowY([...row]) - rowY([...previous]) > pitch * TEXT_GRID_ROW_MAX_PITCH_RATIO) return false;
  const filled = new Set<number>();
  for (const [position, line] of row.entries()) {
    if (!isTableValueCell(line.text) && !isCompactTableLabelCell(line)) return false;
    if (position === 0 && line.x + line.width <= firstColumn.left) continue;
    const hits = columns.map((column, index) => (overlaps(line, column) ? index : -1)).filter((index) => index >= 0);
    if (hits.length !== 1 || filled.has(hits[0])) return false;
    filled.add(hits[0]);
  }
  return filled.size >= Math.max(TEXT_GRID_ROW_MIN_COLUMNS, Math.ceil(columns.length * TEXT_GRID_ROW_MIN_COLUMN_RATIO));
}

function overlaps(line: LayoutLine, column: Extent): boolean {
  return Math.min(line.x + line.width, column.right) - Math.max(line.x, column.left) > 0;
}

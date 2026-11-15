import type { LayoutLine } from '../../types/index.js';
import { isCurrencyOnlyCell, isTableValueCell } from './tableCells.js';
import type { IndexedLayoutRow } from './tableContinuations.js';
import { rowBottom, rowY } from './tableRows.js';

const PLACEHOLDER_ROW_MIN_VALUES = 2;
const PLACEHOLDER_ROW_MAX_GAP_PT = 48;

/**
 * Re-admit rows whose values are all placeholders (`— | —`) when they sit
 * between two candidate rows and every placeholder lies under a value of
 * both neighbours, or directly above a candidate row under its values.
 * Such a row is no evidence of a table on its own, which is why candidate
 * detection skips it, but next to rows of the grid it is one more row of
 * that grid. Leaving it out drops the row from the table and opens a
 * double-height gap that breaks the row cadence check, so the whole table
 * could disappear.
 */
export function admitPlaceholderRows(rows: IndexedLayoutRow[], allRows: readonly LayoutLine[][]): IndexedLayoutRow[] {
  if (rows.length < 2) return rows;
  const admitted: IndexedLayoutRow[] = [];
  for (let position = 0; position + 1 < rows.length; position++) {
    const above = rows[position];
    const below = rows[position + 1];
    if (!isContiguousSpan(allRows, above.index, below.index)) continue;
    for (let index = above.index + 1; index < below.index; index++) {
      const row = allRows[index];
      if (!row || !isPlaceholderOnlyRow(row)) continue;
      if (!placeholdersSitUnderValues(row, above.row) || !placeholdersSitUnderValues(row, below.row)) continue;
      admitted.push({ row, index });
    }
  }
  // Placeholder rows that open a run of rows (the first lines of a table
  // whose earliest items are all empty) are read upward from the first
  // numbered row, up to the first row that is not one.
  const taken = new Set([...rows, ...admitted].map(({ index }) => index));
  for (const below of rows) {
    let next = below.row;
    for (let index = below.index - 1; index >= 0 && !taken.has(index); index--) {
      const row = allRows[index];
      if (!row || rowY(next) - rowBottom(row) > PLACEHOLDER_ROW_MAX_GAP_PT) break;
      next = row;
      // A label line wrapped above its row is passed over, not admitted.
      if (isLabelOnlyRow(row, below.row)) continue;
      if (!isPlaceholderOnlyRow(row) || !placeholdersSitUnderValues(row, below.row)) break;
      admitted.push({ row, index });
      taken.add(index);
    }
  }
  if (admitted.length === 0) return rows;
  return [...rows, ...admitted].sort((a, b) => a.index - b.index);
}

// No step from one page row to the next between the two candidates opens a
// gap wide enough to separate two tables.
function isContiguousSpan(allRows: readonly LayoutLine[][], from: number, to: number): boolean {
  for (let index = from + 1; index <= to; index++) {
    const previous = allRows[index - 1];
    const row = allRows[index];
    if (!previous || !row || rowY(row) - rowBottom(previous) > PLACEHOLDER_ROW_MAX_GAP_PT) return false;
  }
  return true;
}

function isLabelOnlyRow(row: readonly LayoutLine[], valueRow: readonly LayoutLine[]): boolean {
  const valueLeft = Math.min(...valueRow.filter((line) => isTableValueCell(line.text)).map((line) => line.x));
  return row.every(
    (line) => !isTableValueCell(line.text) && /[\p{L}]/u.test(line.text) && line.x + line.width <= valueLeft,
  );
}

function isPlaceholderOnlyRow(row: readonly LayoutLine[]): boolean {
  const values = row.filter((line) => isTableValueCell(line.text));
  if (values.length < PLACEHOLDER_ROW_MIN_VALUES) return false;
  if (values.some((line) => /\d/u.test(line.text))) return false;
  // Anything else is the row's label, left of the values; text among or
  // beyond the values is not a placeholder row.
  const firstValueLeft = Math.min(...values.map((line) => line.x));
  return row.every(
    (line) =>
      isTableValueCell(line.text) ||
      isCurrencyOnlyCell(line.text) ||
      (/[\p{L}]/u.test(line.text) && line.x + line.width <= firstValueLeft),
  );
}

function placeholdersSitUnderValues(row: readonly LayoutLine[], neighbour: readonly LayoutLine[]): boolean {
  const values = neighbour.filter((line) => isTableValueCell(line.text));
  return row
    .filter((line) => isTableValueCell(line.text))
    .every((placeholder) => values.some((value) => horizontalOverlap(placeholder, value) > 0));
}

function horizontalOverlap(a: LayoutLine, b: LayoutLine): number {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
}

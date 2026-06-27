import type { LayoutLine } from '../../types/index.js';
import { isTableNumericCell, numericColumnMatchRight } from './tableCells.js';

export const TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROWS = 4;
export const TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS = 3;
export const TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROW_RATIO = 0.6;
export const TABLE_RECURRING_NUMERIC_COLUMN_TOLERANCE_PT = 10;

export function recurringNumericColumnRights(
  rows: LayoutLine[][],
  options: { minColumns: number; minRows: number },
): number[] {
  const columns: { right: number; rowIndexes: Set<number>; sampleCount: number }[] = [];
  for (const [rowIndex, row] of rows.entries()) {
    const numericCells = row.filter((line) => isTableNumericCell(line.text));
    for (let cellIndex = 0; cellIndex < numericCells.length; cellIndex++) {
      const line = numericCells[cellIndex];
      if (!line) continue;
      const right = numericColumnMatchRight(line, numericCells[cellIndex + 1]);
      let column = columns.find(
        (candidate) => Math.abs(candidate.right - right) <= TABLE_RECURRING_NUMERIC_COLUMN_TOLERANCE_PT,
      );
      if (!column) {
        column = { right, rowIndexes: new Set(), sampleCount: 0 };
        columns.push(column);
      }
      column.right = (column.right * column.sampleCount + right) / (column.sampleCount + 1);
      column.sampleCount += 1;
      column.rowIndexes.add(rowIndex);
    }
  }
  const recurringColumns = columns
    .filter((column) => column.rowIndexes.size >= options.minRows)
    .sort((a, b) => a.right - b.right)
    .map((column) => column.right);
  return recurringColumns.length >= options.minColumns ? recurringColumns : [];
}

export function medianNumber(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

import type { LayoutLine, LayoutTable, LayoutTableRow } from '../../types/index.js';
import { round2 } from './geometry.js';
import { isTableValueCell } from './tableCells.js';
import { rowBottom, rowY } from './tableRows.js';

const GROUP_LABEL_LEFT_TOLERANCE_PT = 24;
const GROUP_LABEL_VALUE_GAP_PT = 2;
const CELL_CONTAINMENT_TOLERANCE_PT = 1;

/**
 * Restore label-only rows that sit between a table's rows in its label
 * column — group headers such as `Net sales:` or `Earnings per share:`.
 * Row detection needs numeric cells, so these rows were dropped, which left
 * repeated sub-labels (`Products`, `Basic`) with nothing to tell them apart.
 */
export function insertTableGroupLabelRows(table: LayoutTable, allRows: readonly LayoutLine[][]): LayoutTable {
  const firstRow = table.rows[0];
  const lastRow = table.rows.at(-1);
  if (!firstRow || !lastRow || table.rows.length < 2) return table;

  const valueLeft = firstValueColumnLeft(table.rows);
  const labelLeft = labelColumnLeft(table.rows);
  if (valueLeft === undefined || labelLeft === undefined) return table;

  const top = firstRow.y + firstRow.height / 2;
  const bottom = lastRow.y + lastRow.height / 2;
  const cells = table.rows.flatMap((row) => row.cells);
  const inserted: LayoutTableRow[] = [];
  for (const row of allRows) {
    const center = (rowY(row) + rowBottom(row)) / 2;
    if (center <= top || center >= bottom) continue;
    if (row.some((line) => cells.some((cell) => contains(cell, line)))) continue;
    // Group headers are a single label; a multi-line text row here is
    // side-by-side prose or a figure, not part of the table.
    if (row.length !== 1 || !isGroupLabelLine(row[0], labelLeft, valueLeft)) continue;
    inserted.push({
      y: round2(rowY(row)),
      height: round2(rowBottom(row) - rowY(row)),
      cells: row.map((line) => ({ text: line.text, x: line.x, y: line.y, width: line.width, height: line.height })),
    });
  }
  if (inserted.length === 0) return table;

  const rows = [...table.rows, ...inserted].sort((a, b) => a.y - b.y);
  const left = Math.min(table.x, ...inserted.flatMap((row) => row.cells.map((cell) => cell.x)));
  const right = table.x + table.width;
  return { ...table, x: round2(left), width: round2(right - left), rowCount: rows.length, rows };
}

function isGroupLabelLine(line: LayoutLine, labelLeft: number, valueLeft: number): boolean {
  if (!/[\p{L}]/u.test(line.text) || isTableValueCell(line.text)) return false;
  if (line.x < labelLeft - GROUP_LABEL_LEFT_TOLERANCE_PT) return false;
  return line.x + line.width <= valueLeft - GROUP_LABEL_VALUE_GAP_PT;
}

function firstValueColumnLeft(rows: readonly LayoutTableRow[]): number | undefined {
  const lefts = rows.flatMap((row) => row.cells.filter((cell) => isTableValueCell(cell.text)).map((cell) => cell.x));
  return lefts.length > 0 ? Math.min(...lefts) : undefined;
}

function labelColumnLeft(rows: readonly LayoutTableRow[]): number | undefined {
  const lefts = rows
    .filter((row) => row.cells.length >= 2 && row.cells.some((cell) => isTableValueCell(cell.text)))
    .map((row) => row.cells[0])
    .filter((cell) => cell !== undefined && !isTableValueCell(cell.text) && /[\p{L}]/u.test(cell.text))
    .map((cell) => cell.x);
  return lefts.length > 0 ? Math.min(...lefts) : undefined;
}

function contains(cell: LayoutTableRow['cells'][number], line: LayoutLine): boolean {
  const tolerance = CELL_CONTAINMENT_TOLERANCE_PT;
  return (
    line.x >= cell.x - tolerance &&
    line.y >= cell.y - tolerance &&
    line.x + line.width <= cell.x + cell.width + tolerance &&
    line.y + line.height <= cell.y + cell.height + tolerance
  );
}

import type { LayoutLine, LayoutTable } from '../../types/index.js';
import { round2, unionBox } from './geometry.js';
import { isLikelyTinyNumericVectorGrid } from './numericVectorGrid.js';
import { tableCandidateRow } from './tableCandidateRows.js';
import { isTableNumericCell, normalizeTableCurrencyCells } from './tableCells.js';
import {
  attachLabelContinuationRows,
  attachNumericContinuationRows,
  hasRegularTableRowCadence,
  type IndexedLayoutRow,
} from './tableContinuations.js';
import { attachLeadingTableRows } from './tableLeadingRows.js';
import { groupLinesByTableRow, rowBottom, rowY } from './tableRows.js';

export { isTableNumericCell } from './tableCells.js';

const TWO_COLUMN_NUMERIC_TABLE_MIN_ROWS = 4;
const TABLE_GROUP_MAX_ROW_GAP_PT = 48;

export function detectLayoutTables(lines: LayoutLine[]): LayoutTable[] | undefined {
  const allRowGroups = groupLinesByTableRow(lines).map((row) => row.sort((a, b) => a.x - b.x));
  const rowGroups: IndexedLayoutRow[] = allRowGroups
    .map((row, index) => ({ row: tableCandidateRow(row), index }))
    .filter((item): item is IndexedLayoutRow => item.row !== undefined)
    .map(({ row, index }) => ({ row: attachLabelContinuationRows(row, index, allRowGroups), index }));
  if (rowGroups.length < 2) return undefined;

  const tables: IndexedLayoutRow[][] = [];
  for (const row of rowGroups) {
    const prevTable = tables.at(-1);
    const prevRow = prevTable?.at(-1);
    if (prevRow && rowY(row.row) - rowBottom(prevRow.row) <= TABLE_GROUP_MAX_ROW_GAP_PT) {
      prevTable?.push(row);
    } else {
      tables.push([row]);
    }
  }

  const result: LayoutTable[] = [];
  for (let index = 0; index < tables.length; index++) {
    const table = tables[index];
    const baseRows = table.map(({ row }) => row);
    if (baseRows.length < 2 || !hasRegularTableRowCadence(baseRows)) continue;
    if (isTwoColumnNumericOnlyTable(baseRows) && baseRows.length < TWO_COLUMN_NUMERIC_TABLE_MIN_ROWS) continue;
    const nextTableFirstIndex = tables[index + 1]?.[0]?.index ?? allRowGroups.length;
    const rows = attachNumericContinuationRows(table, allRowGroups, nextTableFirstIndex);
    const tableRows = attachLeadingTableRows(rows, table[0]?.index ?? 0, allRowGroups);
    if (isLikelyTinyNumericVectorGrid(tableRows.flat())) continue;
    result.push(toLayoutTable(tableRows));
  }
  return result.length > 0 ? result : undefined;
}

function isTwoColumnNumericOnlyTable(rows: LayoutLine[][]): boolean {
  return rows.every((row) => {
    const normalized = normalizeTableCurrencyCells(row);
    return normalized.length === 2 && normalized.every((cell) => isTableNumericCell(cell.text));
  });
}

function toLayoutTable(rows: LayoutLine[][]): LayoutTable {
  const cells = rows.flat();
  const box = unionBox(cells);
  const normalizedRows = rows.map(normalizeTableCurrencyCells);
  return {
    ...box,
    rowCount: rows.length,
    columnCount: Math.max(...normalizedRows.map((row) => row.length)),
    rows: normalizedRows.map((row, index) => ({
      y: round2(rowY(rows[index])),
      height: round2(rowBottom(rows[index]) - rowY(rows[index])),
      cells: row.map((cell) => ({
        text: cell.text,
        x: cell.x,
        y: cell.y,
        width: cell.width,
        height: cell.height,
      })),
    })),
  };
}

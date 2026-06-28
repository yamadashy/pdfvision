import type { LayoutLine, LayoutTable } from '../../types/index.js';
import { type BBox, round2, unionBox } from './geometry.js';
import { isLikelyTinyNumericChartFragment, isLikelyTinyNumericVectorGrid } from './numericVectorGrid.js';
import { detectSparseSingleRowTables } from './sparseTables.js';
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
const ALIGNED_TEXT_TABLE_MIN_ROWS = 5;
const ALIGNED_TEXT_TABLE_MAX_ROW_GAP_PT = 24;
const ALIGNED_TEXT_TABLE_MIN_CELLS = 3;
const ALIGNED_TEXT_TABLE_MIN_RECURRING_COLUMNS = 3;
const ALIGNED_TEXT_TABLE_COLUMN_TOLERANCE_PT = 10;
const ALIGNED_TEXT_TABLE_HEADER_MAX_GAP_PT = 28;
const ALIGNED_TEXT_TABLE_MAX_CELL_WIDTH_PT = 220;
const ALIGNED_TEXT_TABLE_MIN_LABEL_ROW_RATIO = 0.5;

export function detectLayoutTables(lines: LayoutLine[]): LayoutTable[] | undefined {
  const allRowGroups = groupLinesByTableRow(lines).map((row) => row.sort((a, b) => a.x - b.x));
  const alignedTextTables = detectAlignedTextTables(allRowGroups);
  const sparseSingleRowTables = detectSparseSingleRowTables(allRowGroups);
  const rowGroups: IndexedLayoutRow[] = allRowGroups
    .map((row, index) => ({ row: tableCandidateRow(row), index }))
    .filter((item): item is IndexedLayoutRow => item.row !== undefined)
    .map(({ row, index }) => ({ row: attachLabelContinuationRows(row, index, allRowGroups), index }));
  if (rowGroups.length < 2) {
    const fallback = [...alignedTextTables, ...sparseSingleRowTables];
    return fallback.length > 0 ? fallback : undefined;
  }

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
    if (isLikelyTinyNumericChartFragment(tableRows.flat())) continue;
    result.push(toLayoutTable(tableRows));
  }
  for (const table of alignedTextTables) {
    if (result.some((existing) => overlapOfSmaller(existing, table) >= 0.5)) continue;
    result.push(table);
  }
  for (const table of sparseSingleRowTables) {
    if (result.some((existing) => overlapOfSmaller(existing, table) >= 0.5)) continue;
    result.push(table);
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

function detectAlignedTextTables(allRowGroups: LayoutLine[][]): LayoutTable[] {
  const candidateRows: IndexedLayoutRow[] = allRowGroups
    .map((row, index) => ({ row: alignedTextTableCandidateRow(row), index }))
    .filter((item): item is IndexedLayoutRow => item.row !== undefined);
  const groups: IndexedLayoutRow[][] = [];

  for (const row of candidateRows) {
    const previousGroup = groups.at(-1);
    const previousRow = previousGroup?.at(-1);
    if (previousRow && rowY(row.row) - rowBottom(previousRow.row) <= ALIGNED_TEXT_TABLE_MAX_ROW_GAP_PT) {
      previousGroup?.push(row);
    } else {
      groups.push([row]);
    }
  }

  const tables: LayoutTable[] = [];
  for (const group of groups) {
    const baseRows = group.map(({ row }) => row);
    if (isLikelyTinyNumericVectorGrid(baseRows.flat())) continue;
    if (isLikelyTinyNumericChartFragment(baseRows.flat())) continue;
    if (!isAlignedTextTableGroup(baseRows)) continue;
    const rows = attachAlignedTextHeaderRows(group, allRowGroups);
    if (isLikelyTinyNumericChartFragment(rows.flat())) continue;
    tables.push(toLayoutTable(rows));
  }
  return tables;
}

function alignedTextTableCandidateRow(row: LayoutLine[]): LayoutLine[] | undefined {
  if (row.length < ALIGNED_TEXT_TABLE_MIN_CELLS) return undefined;
  if (row.some((line) => line.width > ALIGNED_TEXT_TABLE_MAX_CELL_WIDTH_PT)) return undefined;
  if (!row.some((line) => /\p{N}/u.test(line.text))) return undefined;
  if (row.filter((line) => /[\p{L}\p{N}]/u.test(line.text)).length < ALIGNED_TEXT_TABLE_MIN_CELLS) {
    return undefined;
  }
  return row;
}

function isAlignedTextTableGroup(rows: LayoutLine[][]): boolean {
  if (rows.length < ALIGNED_TEXT_TABLE_MIN_ROWS) return false;
  if (!hasRegularTableRowCadence(rows)) return false;
  if (rows.filter(hasTextLabelCell).length < Math.ceil(rows.length * ALIGNED_TEXT_TABLE_MIN_LABEL_ROW_RATIO)) {
    return false;
  }
  const recurringColumns = recurringColumnBins(rows).filter(
    (count) => count >= Math.max(3, Math.ceil(rows.length * 0.35)),
  );
  return recurringColumns.length >= ALIGNED_TEXT_TABLE_MIN_RECURRING_COLUMNS;
}

function hasTextLabelCell(row: LayoutLine[]): boolean {
  return row.some((line) => !isTableNumericCell(line.text) && /[\p{L}]/u.test(line.text));
}

function attachAlignedTextHeaderRows(group: IndexedLayoutRow[], allRows: LayoutLine[][]): LayoutLine[][] {
  const rows = group.map(({ row }) => row);
  const firstIndex = group[0]?.index ?? 0;
  const bodyBox = unionBox(rows.flat());
  const headers: LayoutLine[][] = [];

  for (let index = firstIndex - 1; index >= 0; index--) {
    const candidate = allRows[index];
    if (!isAlignedTextTableHeaderRow(candidate, bodyBox, headers[0] ?? rows[0])) break;
    headers.unshift(candidate);
  }

  return [...headers, ...rows];
}

function isAlignedTextTableHeaderRow(
  row: LayoutLine[] | undefined,
  tableBox: BBox,
  nextRow: LayoutLine[] | undefined,
): row is LayoutLine[] {
  if (!row || !nextRow) return false;
  if (row.length < 2) return false;
  if (row.some((line) => line.width > ALIGNED_TEXT_TABLE_MAX_CELL_WIDTH_PT)) return false;
  if (row.some((line) => !/[\p{L}\p{N}()（）]/u.test(line.text))) return false;
  if (rowY(nextRow) - rowBottom(row) > ALIGNED_TEXT_TABLE_HEADER_MAX_GAP_PT) return false;

  const rowBox = unionBox(row);
  const overlap = Math.min(rowBox.x + rowBox.width, tableBox.x + tableBox.width) - Math.max(rowBox.x, tableBox.x);
  return overlap >= Math.min(rowBox.width, tableBox.width) * 0.35;
}

function recurringColumnBins(rows: LayoutLine[][]): number[] {
  const bins: number[] = [];
  for (const line of rows.flat()) {
    const index = bins.findIndex((x) => Math.abs(x - line.x) <= ALIGNED_TEXT_TABLE_COLUMN_TOLERANCE_PT);
    if (index === -1) {
      bins.push(line.x);
    }
  }

  return bins.map((bin) => {
    let count = 0;
    for (const row of rows) {
      if (row.some((line) => Math.abs(line.x - bin) <= ALIGNED_TEXT_TABLE_COLUMN_TOLERANCE_PT)) count++;
    }
    return count;
  });
}

function overlapOfSmaller(a: BBox, b: BBox): number {
  const smaller = Math.min(area(a), area(b));
  return smaller > 0 ? overlapArea(a, b) / smaller : 0;
}

function overlapArea(a: BBox, b: BBox): number {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
}

function area(box: BBox): number {
  return Math.max(0, box.width) * Math.max(0, box.height);
}

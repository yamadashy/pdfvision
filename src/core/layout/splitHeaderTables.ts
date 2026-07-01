import type { LayoutTable, LayoutTableCell, LayoutTableRow } from '../../types/index.js';
import { round2 } from './geometry.js';

const SPLIT_HEADER_MAX_ROWS = 10;
const SPLIT_HEADER_MAX_VERTICAL_GAP_PT = 8;
const SPLIT_HEADER_MAX_HEADER_TO_BODY_GAP_PT = 48;
const SPLIT_HEADER_MAX_INTERNAL_ROW_GAP_PT = 24;
const SPLIT_HEADER_DUPLICATE_X_TOLERANCE_PT = 16;
const SPLIT_HEADER_MIN_ROW_OVERLAP_RATIO = 0.55;
const SPLIT_HEADER_RUNNING_HEADER_MIN_SPAN_RATIO = 0.8;
const SPLIT_HEADER_RUNNING_HEADER_MIN_GAP_RATIO = 0.55;

export function mergeSplitHeaderTables(tables: LayoutTable[]): LayoutTable[] {
  const removed = new Set<number>();
  const merged = tables.map((table, tableIndex) => {
    const headerIndex = findSplitHeaderIndex(table, tableIndex, tables, removed);
    if (headerIndex === undefined) return table;

    const header = tables[headerIndex];
    const duplicateRowIndex = duplicateBoundaryRowIndex(header, table.rows[0]);
    if (duplicateRowIndex === undefined) return table;

    const headerRows = splitHeaderRows(header.rows, duplicateRowIndex, table);
    if (headerRows.length === 0) return table;

    removed.add(headerIndex);
    return rebuildTable([...headerRows, ...table.rows]);
  });

  return merged.filter((_, index) => !removed.has(index));
}

function splitHeaderRows(
  rows: readonly LayoutTableRow[],
  duplicateRowIndex: number,
  table: LayoutTable,
): LayoutTableRow[] {
  const candidates: LayoutTableRow[] = [];
  let next = rows[duplicateRowIndex];
  for (let index = duplicateRowIndex - 1; index >= 0; index--) {
    const row = rows[index];
    if (!row || !next) break;
    const maxGap =
      index === duplicateRowIndex - 1 ? SPLIT_HEADER_MAX_HEADER_TO_BODY_GAP_PT : SPLIT_HEADER_MAX_INTERNAL_ROW_GAP_PT;
    if (row.y + row.height < next.y && next.y - (row.y + row.height) > maxGap) break;
    candidates.unshift(row);
    next = row;
  }
  return candidates.filter((row) => isSplitHeaderRow(row, table));
}

function isSplitHeaderRow(row: LayoutTableRow, table: LayoutTable): boolean {
  return row.cells.length >= 2 && rowOverlapsTable(row, table) && !isRunningHeaderLike(row, table);
}

function findSplitHeaderIndex(
  table: LayoutTable,
  tableIndex: number,
  tables: readonly LayoutTable[],
  removed: ReadonlySet<number>,
): number | undefined {
  let best: { index: number; gap: number } | undefined;
  for (let index = 0; index < tables.length; index++) {
    if (index === tableIndex || removed.has(index)) continue;
    const candidate = tables[index];
    if (candidate.rows.length > SPLIT_HEADER_MAX_ROWS) continue;
    if (candidate.y >= table.y) continue;
    if (duplicateBoundaryRowIndex(candidate, table.rows[0]) === undefined) continue;

    const gap = table.y - (candidate.y + candidate.height);
    if (gap > SPLIT_HEADER_MAX_VERTICAL_GAP_PT) continue;
    if (!best || Math.abs(gap) < Math.abs(best.gap)) best = { index, gap };
  }
  return best?.index;
}

function duplicateBoundaryRowIndex(header: LayoutTable, firstBodyRow: LayoutTableRow | undefined): number | undefined {
  if (!firstBodyRow) return undefined;
  for (let index = header.rows.length - 1; index >= 0; index--) {
    if (rowsMatch(header.rows[index], firstBodyRow)) return index;
  }
  return undefined;
}

function rowsMatch(a: LayoutTableRow | undefined, b: LayoutTableRow | undefined): boolean {
  if (!a || !b || a.cells.length < 2 || b.cells.length < 2) return false;
  const maxCells = Math.max(a.cells.length, b.cells.length);
  if (Math.abs(a.cells.length - b.cells.length) > Math.ceil(maxCells * 0.25)) return false;

  let matched = 0;
  for (const cell of a.cells) {
    if (b.cells.some((other) => cellsMatch(cell, other))) matched++;
  }
  return matched >= Math.max(2, Math.ceil(Math.min(a.cells.length, b.cells.length) * 0.65));
}

function cellsMatch(a: LayoutTableCell, b: LayoutTableCell): boolean {
  return (
    normalizeCellText(a.text) === normalizeCellText(b.text) &&
    Math.abs(a.x - b.x) <= SPLIT_HEADER_DUPLICATE_X_TOLERANCE_PT
  );
}

function normalizeCellText(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

function rowOverlapsTable(row: LayoutTableRow, table: LayoutTable): boolean {
  const rowBox = rowBounds(row);
  if (!rowBox) return false;
  const overlap = Math.min(rowBox.x + rowBox.width, table.x + table.width) - Math.max(rowBox.x, table.x);
  return overlap >= Math.min(rowBox.width, table.width) * SPLIT_HEADER_MIN_ROW_OVERLAP_RATIO;
}

function isRunningHeaderLike(row: LayoutTableRow, table: LayoutTable): boolean {
  if (row.cells.length > 2) return false;
  const rowBox = rowBounds(row);
  if (!rowBox) return false;
  if (rowBox.width < table.width * SPLIT_HEADER_RUNNING_HEADER_MIN_SPAN_RATIO) return false;

  const cells = [...row.cells].sort((a, b) => a.x - b.x);
  const largestGap = cells.slice(1).reduce((gap, cell, index) => {
    const previous = cells[index];
    return Math.max(gap, cell.x - (previous.x + previous.width));
  }, 0);
  return largestGap >= table.width * SPLIT_HEADER_RUNNING_HEADER_MIN_GAP_RATIO;
}

function rebuildTable(rows: LayoutTableRow[]): LayoutTable {
  const cells = rows.flatMap((row) => row.cells);
  const left = Math.min(...cells.map((cell) => cell.x));
  const top = Math.min(...cells.map((cell) => cell.y));
  const right = Math.max(...cells.map((cell) => cell.x + cell.width));
  const bottom = Math.max(...cells.map((cell) => cell.y + cell.height));
  return {
    x: round2(left),
    y: round2(top),
    width: round2(right - left),
    height: round2(bottom - top),
    rowCount: rows.length,
    columnCount: Math.max(...rows.map((row) => row.cells.length)),
    rows,
  };
}

function rowBounds(row: LayoutTableRow): { x: number; width: number } | undefined {
  if (row.cells.length === 0) return undefined;
  const left = Math.min(...row.cells.map((cell) => cell.x));
  const right = Math.max(...row.cells.map((cell) => cell.x + cell.width));
  return { x: left, width: right - left };
}

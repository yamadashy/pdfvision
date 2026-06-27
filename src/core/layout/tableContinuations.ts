import type { LayoutLine } from '../../types/index.js';
import { firstTableLabelCell, isNumericOnlyTableRow, isRestorableTableLabelCell } from './tableCandidateRows.js';
import { isCurrencyOnlyCell, isTableNumericCell, numericColumnMatchRight } from './tableCells.js';
import {
  medianNumber,
  recurringNumericColumnRights,
  TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS,
  TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROW_RATIO,
  TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROWS,
  TABLE_RECURRING_NUMERIC_COLUMN_TOLERANCE_PT,
} from './tableColumnStats.js';
import { mergeLineTexts, rowBottom, rowY } from './tableRows.js';

export interface IndexedLayoutRow {
  row: LayoutLine[];
  index: number;
}

const TABLE_ROW_MIN_NUMERIC_CELLS = 2;
const TABLE_GROUP_MAX_ROW_GAP_PT = 48;
const TABLE_ROW_CADENCE_MIN_MATCH_RATIO = 0.65;
const TABLE_ROW_CADENCE_TOLERANCE_RATIO = 0.25;
const TABLE_ROW_CADENCE_MIN_TOLERANCE_PT = 2;
const TABLE_DROPPED_LABEL_X_TOLERANCE_PT = 14;

export function attachNumericContinuationRows(
  table: IndexedLayoutRow[],
  allRows: LayoutLine[][],
  scanEndIndex: number,
): LayoutLine[][] {
  const baseRowsByIndex = new Map(table.map(({ row, index }) => [index, row]));
  const baseRows = table.map(({ row }) => row);
  const numericColumnRights = recurringNumericColumnRights(baseRows, {
    minColumns: TABLE_ROW_MIN_NUMERIC_CELLS,
    minRows: Math.min(
      baseRows.length,
      Math.max(2, Math.ceil(baseRows.length * TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROW_RATIO)),
    ),
  });
  if (numericColumnRights.length < TABLE_ROW_MIN_NUMERIC_CELLS) return baseRows;

  const firstIndex = table[0]?.index ?? 0;
  const lastBaseIndex = table.at(-1)?.index ?? firstIndex;
  const rows: LayoutLine[][] = [];
  let previousIncluded: LayoutLine[] | undefined;
  let previousLabelCell: LayoutLine | undefined;
  for (let index = firstIndex; index < scanEndIndex; index++) {
    const baseRow = baseRowsByIndex.get(index);
    if (baseRow) {
      const row = restoreDroppedLabelCell(baseRow, allRows[index], previousLabelCell);
      rows.push(row);
      previousIncluded = row;
      previousLabelCell = firstTableLabelCell(row) ?? previousLabelCell;
      continue;
    }

    if (!previousIncluded) continue;
    const candidate = allRows[index];
    if (!candidate) continue;
    const verticalGap = rowY(candidate) - rowBottom(previousIncluded);
    if (index > lastBaseIndex && verticalGap > TABLE_GROUP_MAX_ROW_GAP_PT) break;
    if (verticalGap > TABLE_GROUP_MAX_ROW_GAP_PT) continue;
    if (!isAlignedNumericContinuationRow(candidate, numericColumnRights)) continue;

    const row = restoreDroppedLabelCell(candidate, allRows[index], previousLabelCell);
    rows.push(row);
    previousIncluded = row;
    previousLabelCell = firstTableLabelCell(row) ?? previousLabelCell;
  }
  return rows;
}

export function attachLabelContinuationRows(
  row: LayoutLine[],
  rowIndex: number,
  allRows: LayoutLine[][],
): LayoutLine[] {
  const label = row.find((line) => !isTableNumericCell(line.text) && /[\p{L}]/u.test(line.text));
  if (!label) return row;

  const continuations: LayoutLine[] = [];
  let previousBottom = label.y;
  for (let index = rowIndex - 1; index >= 0; index--) {
    const candidate = allRows[index];
    if (!isLabelContinuationRow(candidate, label, previousBottom)) break;
    continuations.unshift(mergeLineTexts(candidate));
    previousBottom = rowY(candidate);
  }
  if (continuations.length === 0) return row;

  const mergedLabel = mergeLineTexts([...continuations, label]);
  return row.map((line) => (line === label ? mergedLabel : line));
}

export function hasRegularTableRowCadence(rows: LayoutLine[][]): boolean {
  const gaps = rowGaps(rows);
  if (gaps.length < 2) return true;
  if (cadenceMatchRatio(gaps) >= TABLE_ROW_CADENCE_MIN_MATCH_RATIO) return true;
  return hasRecurringNumericColumns(rows);
}

function restoreDroppedLabelCell(
  row: LayoutLine[],
  rawRow: LayoutLine[] | undefined,
  previousLabelCell: LayoutLine | undefined,
): LayoutLine[] {
  if (!rawRow || !previousLabelCell) return row;
  if (firstTableLabelCell(row)) return row;
  if (!isNumericOnlyTableRow(row)) return row;
  const droppedLabel = rawRow.find((line) => {
    if (row.includes(line)) return false;
    if (!isRestorableTableLabelCell(line)) return false;
    return Math.abs(line.x - previousLabelCell.x) <= TABLE_DROPPED_LABEL_X_TOLERANCE_PT;
  });
  return droppedLabel ? rawRow : row;
}

function isAlignedNumericContinuationRow(row: LayoutLine[], columnRights: number[]): boolean {
  const valueCells = row.filter((line) => isTableNumericCell(line.text));
  if (valueCells.length < TABLE_ROW_MIN_NUMERIC_CELLS) return false;
  if (row.some((line) => !isTableNumericCell(line.text) && !isCurrencyOnlyCell(line.text))) return false;

  let matchedCells = 0;
  const matchedColumns = new Set<number>();
  for (let cellIndex = 0; cellIndex < valueCells.length; cellIndex++) {
    const cell = valueCells[cellIndex];
    if (!cell) continue;
    const right = numericColumnMatchRight(cell, valueCells[cellIndex + 1]);
    const columnIndex = columnRights.findIndex(
      (columnRight) => Math.abs(columnRight - right) <= TABLE_RECURRING_NUMERIC_COLUMN_TOLERANCE_PT,
    );
    if (columnIndex < 0) return false;
    matchedCells += 1;
    matchedColumns.add(columnIndex);
  }
  return matchedCells >= TABLE_ROW_MIN_NUMERIC_CELLS && matchedColumns.size >= TABLE_ROW_MIN_NUMERIC_CELLS;
}

function isLabelContinuationRow(row: LayoutLine[], label: LayoutLine, nextTop: number): boolean {
  if (row.length === 0 || row.length > 2) return false;
  if (row.some((line) => isTableNumericCell(line.text))) return false;
  const merged = mergeLineTexts(row);
  if (merged.text.trim().endsWith(':')) return false;
  if (!/[\p{L}]/u.test(merged.text)) return false;
  if (Math.abs(merged.x - label.x) > Math.max(12, label.fontSize * 2)) return false;
  const gap = nextTop - (merged.y + merged.height);
  return gap >= -1 && gap <= Math.max(18, label.fontSize * 2.2);
}

function rowGaps(rows: LayoutLine[][]): number[] {
  const ys = rows.map(rowY).sort((a, b) => a - b);
  return ys
    .slice(1)
    .map((y, index) => y - ys[index])
    .filter((gap) => gap > 0.5);
}

function cadenceMatchRatio(gaps: number[]): number {
  if (gaps.length === 0) return 1;
  const median = medianNumber(gaps);
  const tolerance = Math.max(TABLE_ROW_CADENCE_MIN_TOLERANCE_PT, median * TABLE_ROW_CADENCE_TOLERANCE_RATIO);
  return gaps.filter((gap) => Math.abs(gap - median) <= tolerance).length / gaps.length;
}

function hasRecurringNumericColumns(rows: LayoutLine[][]): boolean {
  const minRows = Math.max(
    TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROWS,
    Math.ceil(rows.length * TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROW_RATIO),
  );
  if (rows.filter(hasTableLabelCell).length < minRows) return false;
  return (
    recurringNumericColumnRights(rows, {
      minColumns: TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS,
      minRows,
    }).length >= TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS
  );
}

function hasTableLabelCell(row: LayoutLine[]): boolean {
  return firstTableLabelCell(row) !== undefined;
}

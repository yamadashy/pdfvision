import type { LayoutLine } from '../../types/index.js';
import { firstTableLabelCell, isNumericOnlyTableRow, isRestorableTableLabelCell } from './tableCandidateRows.js';
import { isCurrencyOnlyCell, isTableNumericCell, isTableValueCell, numericColumnMatchRight } from './tableCells.js';
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
  /** Column header row found directly above this row's label; see {@link scanLabelContinuationRows}. */
  header?: LayoutLine[];
}

const TABLE_ROW_MIN_NUMERIC_CELLS = 2;
const TABLE_GROUP_MAX_ROW_GAP_PT = 48;
const TABLE_ROW_CADENCE_MIN_MATCH_RATIO = 0.65;
const TABLE_ROW_CADENCE_TOLERANCE_RATIO = 0.25;
const TABLE_ROW_CADENCE_MIN_TOLERANCE_PT = 2;
const TABLE_DROPPED_LABEL_X_TOLERANCE_PT = 14;
const TABLE_LABEL_CONTINUATION_PROSE_MIN_WORDS = 6;
const TABLE_LABEL_CONTINUATION_PROSE_MIN_WIDTH_PT = 220;
const TABLE_LABEL_CONTINUATION_MAX_ROWS = 4;

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
  return scanLabelContinuationRows(row, rowIndex, allRows, { stopAtColumnHeader: false }).row;
}

/**
 * Fold label-only rows above `row` into its label. Scanning stops at a row
 * that reaches over the value columns: that is a column header, not the
 * first half of a wrapped label, and it is returned as `header` so the
 * caller can keep it as a row of its own.
 */
export function scanLabelContinuationRows(
  row: LayoutLine[],
  rowIndex: number,
  allRows: LayoutLine[][],
  options: { stopAtColumnHeader: boolean } = { stopAtColumnHeader: true },
): { row: LayoutLine[]; header?: LayoutLine[] } {
  const label = row.find((line) => !isTableNumericCell(line.text) && /[\p{L}]/u.test(line.text));
  if (!label) return { row };

  const valueLeft = Math.min(
    ...row.filter((line) => line.x > label.x && isTableValueCell(line.text)).map((line) => line.x),
  );
  const continuations: LayoutLine[] = [];
  let header: LayoutLine[] | undefined;
  let previousBottom = label.y;
  for (let index = rowIndex - 1; index >= 0; index--) {
    const candidate = allRows[index];
    if (!isLabelContinuationRow(candidate, label, previousBottom)) break;
    if (options.stopAtColumnHeader && isColumnHeaderAboveRow(candidate, valueLeft)) {
      header = candidate;
      break;
    }
    continuations.unshift(mergeLineTexts(candidate));
    previousBottom = rowY(candidate);
  }
  if (continuations.length === 0) return { row, header };
  // A label does not wrap over this many lines; folding them would glue a
  // prose paragraph that happens to end in subscripts onto a table row.
  if (options.stopAtColumnHeader && continuations.length > TABLE_LABEL_CONTINUATION_MAX_ROWS) return { row };

  const mergedLabel = mergeLineTexts([...continuations, label]);
  return { row: row.map((line) => (line === label ? mergedLabel : line)), header };
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
  if (row.some((line) => !isTableValueCell(line.text) && !isCurrencyOnlyCell(line.text))) return false;

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

function isColumnHeaderAboveRow(row: LayoutLine[], valueLeft: number): boolean {
  if (Math.max(...row.map((line) => line.x + line.width)) <= valueLeft) return false;
  // A single page-wide line is a wrapped prose paragraph, not a header.
  return row.length >= 2 || row.every((line) => line.width < TABLE_LABEL_CONTINUATION_PROSE_MIN_WIDTH_PT);
}

function isLabelContinuationRow(row: LayoutLine[], label: LayoutLine, nextTop: number): boolean {
  if (row.length === 0 || row.length > 2) return false;
  if (row.some((line) => isTableNumericCell(line.text))) return false;
  const merged = mergeLineTexts(row);
  if (merged.text.trim().endsWith(':')) return false;
  if (isWideProseParagraphLine(merged, label)) return false;
  if (!/[\p{L}]/u.test(merged.text)) return false;
  if (Math.abs(merged.x - label.x) > Math.max(12, label.fontSize * 2)) return false;
  const gap = nextTop - (merged.y + merged.height);
  return gap >= -1 && gap <= Math.max(18, label.fontSize * 2.2);
}

function isWideProseParagraphLine(line: LayoutLine, label: LayoutLine): boolean {
  if (line.width < Math.max(TABLE_LABEL_CONTINUATION_PROSE_MIN_WIDTH_PT, label.width * 1.5)) return false;
  const normalized = line.text.replace(/\s+/g, ' ').trim();
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount < TABLE_LABEL_CONTINUATION_PROSE_MIN_WORDS) return false;
  return /[.!?](?:["')\]]*)$/u.test(normalized);
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

import type { LayoutLine } from '../../types/index.js';
import { isCaptionHeadingText } from './headingText.js';
import { foldWrappedLines } from './tableBridgeRows.js';
import { firstTableLabelCell, isNumericOnlyTableRow, isRestorableTableLabelCell } from './tableCandidateRows.js';
import { isCurrencyOnlyCell, isTableNumericCell, isTableValueCell, numericColumnMatchRight } from './tableCells.js';
import {
  recurringNumericColumnRights,
  TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROW_RATIO,
  TABLE_RECURRING_NUMERIC_COLUMN_TOLERANCE_PT,
} from './tableColumnStats.js';
import { isTextGridRow, rowPitch, valueColumnExtents } from './tableGridRows.js';
import { type CarriedLabelLines, wrapsFromRowAbove } from './tableLabelWraps.js';
import { mergeLineTexts, rowBottom, rowY } from './tableRows.js';

export interface IndexedLayoutRow {
  row: LayoutLine[];
  index: number;
  /** Column header row found directly above this row's label; see {@link scanLabelContinuationRows}. */
  header?: LayoutLine[];
}

const TABLE_ROW_MIN_NUMERIC_CELLS = 2;
const TABLE_GROUP_MAX_ROW_GAP_PT = 48;
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
  const valueColumns = valueColumnExtents(baseRows);
  const pitch = rowPitch(baseRows);
  const rows: LayoutLine[][] = [];
  let previousIncluded: LayoutLine[] | undefined;
  let previousIncludedIndex = -1;
  let previousLabelCell: LayoutLine | undefined;
  const include = (included: LayoutLine[], index: number) => {
    let row = included;
    const above = previousIncluded;
    if (above && index > previousIncludedIndex + 1) {
      // Lines of a text cell wrapped between two rows join that cell.
      const between = allRows
        .slice(previousIncludedIndex + 1, index)
        .filter((line) => !isClaimedRow(line, above) && !isClaimedRow(line, included))
        .map((line) => ({ row: line }));
      const folded = foldWrappedLines(above, between, row);
      rows[rows.length - 1] = folded.above;
      row = folded.below;
    }
    rows.push(row);
    previousIncluded = row;
    previousIncludedIndex = index;
    previousLabelCell = firstTableLabelCell(row) ?? previousLabelCell;
  };
  for (let index = firstIndex; index < scanEndIndex; index++) {
    const baseRow = baseRowsByIndex.get(index);
    if (baseRow) {
      include(restoreDroppedLabelCell(baseRow, allRows[index], previousLabelCell), index);
      continue;
    }

    if (!previousIncluded) continue;
    const candidate = allRows[index];
    if (!candidate) continue;
    const verticalGap = rowY(candidate) - rowBottom(previousIncluded);
    if (index > lastBaseIndex && verticalGap > TABLE_GROUP_MAX_ROW_GAP_PT) break;
    if (verticalGap > TABLE_GROUP_MAX_ROW_GAP_PT) continue;
    const continuesGrid =
      isAlignedNumericContinuationRow(candidate, numericColumnRights) ||
      (index === previousIncludedIndex + 1 && isTextGridRow(candidate, previousIncluded, valueColumns, pitch));
    if (!continuesGrid) continue;
    include(restoreDroppedLabelCell(candidate, allRows[index], previousLabelCell), index);
  }
  return rows;
}

// Every line of `row` already lies inside a cell of `owner` (a label line
// folded in while the rows were scanned).
function isClaimedRow(row: readonly LayoutLine[], owner: readonly LayoutLine[]): boolean {
  return row.every((line) =>
    owner.some(
      (cell) =>
        line.x >= cell.x - 1 &&
        line.y >= cell.y - 1 &&
        line.x + line.width <= cell.x + cell.width + 1 &&
        line.y + line.height <= cell.y + cell.height + 1,
    ),
  );
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
 * caller can keep it as a row of its own. When the rows are the wrapped tail of the
 * table row above instead (see {@link wrapsFromRowAbove}), they are not
 * folded here but returned as `carriedUp` for the caller to fold there;
 * `tableRowIndexes` says which rows the caller treats as table rows.
 */
export function scanLabelContinuationRows(
  row: LayoutLine[],
  rowIndex: number,
  allRows: LayoutLine[][],
  options: { stopAtColumnHeader: boolean; tableRowIndexes?: ReadonlySet<number> } = { stopAtColumnHeader: true },
): { row: LayoutLine[]; header?: LayoutLine[]; carriedUp?: CarriedLabelLines } {
  const label = row.find((line) => !isTableNumericCell(line.text) && /[\p{L}]/u.test(line.text));
  if (!label) return { row };

  const valueLeft = Math.min(
    ...row.filter((line) => line.x > label.x && isTableValueCell(line.text)).map((line) => line.x),
  );
  const run: LayoutLine[][] = [];
  let header: LayoutLine[] | undefined;
  let previousBottom = label.y;
  let index = rowIndex - 1;
  for (; index >= 0; index--) {
    const candidate = allRows[index];
    if (!isLabelContinuationRow(candidate, label, previousBottom)) break;
    if (options.stopAtColumnHeader && isColumnHeaderAboveRow(candidate, valueLeft)) {
      header = candidate;
      break;
    }
    run.unshift(candidate);
    previousBottom = rowY(candidate);
  }
  if (run.length === 0) return { row, header };
  // A label does not wrap over this many lines; folding them would glue a
  // prose paragraph that happens to end in subscripts onto a table row.
  if (options.stopAtColumnHeader && run.length > TABLE_LABEL_CONTINUATION_MAX_ROWS) return { row };

  const continuations = run.map(mergeLineTexts);
  const above = allRows[index];
  if (options.tableRowIndexes?.has(index) && above && wrapsFromRowAbove(above, continuations, row)) {
    return { row, header, carriedUp: { index, lines: continuations } };
  }
  const mergedLabel = mergeLineTexts([...continuations, label]);
  return { row: row.map((line) => (line === label ? mergedLabel : line)), header };
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
  if (isCaptionHeadingText(merged.text)) return false;
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

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
const WORD_SPACE_EM = 0.25;
const WRAP_FIT_MARGIN_EM = 0.5;

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
      // A heading that had room for the label's next word is not its first
      // line; the lines between stay rows of their own.
      const last = between.at(-1);
      if (!last || !isHeadingAboveLabel(last.row, row, allRows, index)) {
        const folded = foldWrappedLines(above, between, row);
        rows[rows.length - 1] = folded.above;
        row = folded.below;
      }
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
  // A label only wraps once its next word no longer fits on the line. A
  // line above it that had room for that word (a group heading such as
  // `Panel A. All counties`) is not its first line. The row is detected
  // with it as before (it bridges the gap to the row above), and the
  // heading is set back on a row of its own when the table is built.
  const headings = headingLineCount(continuations, label, allRows, rowIndex);
  if (headings > 0) {
    const rest = continuations.slice(headings);
    headingSplits.set(mergedLabel, {
      heading: mergeLineTexts(continuations.slice(0, headings)),
      label: rest.length > 0 ? mergeLineTexts([...rest, label]) : label,
    });
  }
  return { row: row.map((line) => (line === label ? mergedLabel : line)), header };
}

const headingSplits = new WeakMap<LayoutLine, { heading: LayoutLine; label: LayoutLine }>();

function headingLineCount(
  continuations: readonly LayoutLine[],
  label: LayoutLine,
  allRows: readonly LayoutLine[][],
  rowIndex: number,
): number {
  if (isStandaloneLabelElsewhere(label, allRows, rowIndex)) return continuations.length;
  const labelRight = labelColumnRight(label, allRows);
  let start = continuations.length;
  while (start > 0) {
    const next = start < continuations.length ? continuations[start] : label;
    if (!isWrappedHeadOf(continuations[start - 1], next, labelRight)) break;
    start--;
  }
  return start;
}

/** Set the group headings folded into row labels back on rows of their own. */
export function splitHeadingRows(rows: readonly LayoutLine[][]): LayoutLine[][] {
  return rows.flatMap((row) => {
    const index = row.findIndex((line) => headingSplits.has(line));
    const split = index >= 0 ? headingSplits.get(row[index]) : undefined;
    if (!split) return [row];
    return [[split.heading], row.map((line, position) => (position === index ? split.label : line))];
  });
}

function isHeadingAboveLabel(
  candidate: readonly LayoutLine[],
  row: readonly LayoutLine[],
  allRows: readonly LayoutLine[][],
  rowIndex: number,
): boolean {
  const label = firstTableLabelCell([...row]);
  const [line] = candidate;
  if (!label || !line || candidate.length !== 1 || !isRestorableTableLabelCell(line)) return false;
  if (Math.abs(line.x - label.x) > TABLE_DROPPED_LABEL_X_TOLERANCE_PT) return false;
  // A line reaching over the row's values spans the table: a heading, not a label line.
  const valueLeft = Math.min(...row.filter((cell) => isTableValueCell(cell.text)).map((cell) => cell.x));
  if (line.x + line.width > valueLeft) return true;
  if (isStandaloneLabelElsewhere(label, allRows, rowIndex)) return true;
  return !isWrappedHeadOf(line, label, labelColumnRight(label, allRows));
}

/**
 * The right edge of the label column `label` starts: the widest first
 * cell starting where it does on a row with more cells.
 */
export function labelColumnRight(label: LayoutLine, allRows: readonly LayoutLine[][]): number {
  const firsts = allRows.flatMap((row) => {
    const first = row[0];
    if (!first || row.length < 2 || Math.abs(first.x - label.x) > TABLE_DROPPED_LABEL_X_TOLERANCE_PT) return [];
    if (isTableValueCell(first.text)) return [];
    if (!row.some((line) => line !== first && isTableValueCell(line.text))) return [];
    return [first];
  });
  // The first such row is where a header sits (\`(In millions, except per-share
  // amounts) | 2024 | 2023\`), and its first cell can run far past the labels.
  const body = firsts.length > 2 ? firsts.slice(1) : firsts;
  return Math.max(label.x + label.width, ...body.map((first) => first.x + first.width));
}

/**
 * Whether `head` can be the line a label wrapped from onto `next`: the
 * first word of `next` would not have fitted after it inside the label
 * column.
 */
export function isWrappedHeadOf(head: LayoutLine, next: LayoutLine, labelRight: number): boolean {
  const text = next.text.trim();
  const word = text.split(/\s+/u)[0] ?? '';
  if (text.length === 0 || word.length === 0) return true;
  const wordWidth = (next.width * word.length) / text.length;
  const space = head.fontSize * WORD_SPACE_EM;
  // Only a clear fit counts: widths here are estimates.
  return head.x + head.width + space + wordWidth > labelRight - head.fontSize * WRAP_FIT_MARGIN_EM;
}

/** Whether `label`'s text is also a whole row label elsewhere on the page: a label complete on its own line. */
function isStandaloneLabelElsewhere(label: LayoutLine, allRows: readonly LayoutLine[][], rowIndex: number): boolean {
  const text = label.text.trim();
  return allRows.some(
    (row, index) =>
      index !== rowIndex &&
      row.length >= 2 &&
      row[0]?.text.trim() === text &&
      row.some((line) => line !== row[0] && isTableValueCell(line.text)),
  );
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

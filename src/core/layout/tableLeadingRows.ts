import type { LayoutLine } from '../../types/index.js';
import { type BBox, unionBox } from './geometry.js';
import { isCaptionHeadingText } from './headingText.js';
import { isCompactTableLabelCell } from './tableCandidateRows.js';
import { isCurrencyOnlyCell, isTableNumericCell, isTableValueCell, numericColumnMatchRight } from './tableCells.js';
import {
  medianNumber,
  recurringNumericColumnRights,
  TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS,
  TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROW_RATIO,
  TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROWS,
  TABLE_RECURRING_NUMERIC_COLUMN_TOLERANCE_PT,
} from './tableColumnStats.js';
import { rowBottom, rowY } from './tableRows.js';

const TABLE_LEADING_ROW_MAX_GAP_PT = 24;
const TABLE_LEADING_ROW_MAX_OVERLAP_PT = 4;
const TABLE_LEADING_ROW_X_TOLERANCE_PT = 14;
const TABLE_LEADING_HEADER_MAX_CHARS = 80;
const TABLE_LEADING_HEADER_MAX_WORDS = 6;
const TABLE_LEADING_HEADER_MAX_WIDTH_PT = 180;
const TABLE_LEADING_DATE_HEADER_X_TOLERANCE_PT = 20;
const TABLE_LEADING_DATE_HEADER_MIN_COLUMNS = 2;
const TABLE_LEADING_DATE_HEADER_PATTERN =
  /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2},?(?:\s+\d{4})?(?:\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2},?(?:\s+\d{4})?)*$/iu;

export function attachLeadingTableRows(
  rows: LayoutLine[][],
  firstBaseIndex: number,
  allRows: LayoutLine[][],
): LayoutLine[][] {
  const numericColumnRights = recurringNumericColumnRights(rows, {
    minColumns: TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS,
    minRows: Math.min(rows.length, Math.max(2, Math.ceil(rows.length * TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROW_RATIO))),
  });
  const leadingColumnRights =
    numericColumnRights.length >= TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS
      ? numericColumnRights
      : firstRowNumericColumnRights(rows, TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS);
  const dateHeaderColumnRights =
    leadingColumnRights.length >= TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS
      ? leadingColumnRights
      : twoColumnDateHeaderRights(rows);
  if (
    leadingColumnRights.length < TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS &&
    dateHeaderColumnRights.length < TABLE_LEADING_DATE_HEADER_MIN_COLUMNS
  ) {
    return rows;
  }

  const labelLeft = recurringLabelColumnLeft(rows);
  const tableBox = unionBox(rows.flat());
  const leadingRows: LayoutLine[][] = [];
  let nextIncluded = rows[0];

  const isLeading = (row: LayoutLine[]) =>
    isLeadingTableRow(row, tableBox, leadingColumnRights, dateHeaderColumnRights, labelLeft, leadingRows.length > 0);
  let gapRow: LayoutLine[] | undefined;
  for (let index = firstBaseIndex - 1; index >= 0; index--) {
    const candidate = allRows[index];
    if (!candidate || !nextIncluded) break;
    // A label line already folded into the first row (its wrapped head)
    // is that row's, not a row above it.
    if (leadingRows.length === 0 && isFoldedInto(candidate, nextIncluded)) continue;
    if (!isWithinLeadingGap(candidate, nextIncluded)) break;
    if (isLeading(candidate)) {
      leadingRows.unshift(candidate);
      nextIncluded = candidate;
      continue;
    }
    // A single line between the column header and the rows below it is the
    // header's own: the second line of a wrapped header cell (`消去又は` /
    // `全社`, joined to its cell later by joinWrappedHeaderRows), or a group
    // label set under the header (`Open source`). Taken only when the header
    // row above it is.
    const header = allRows[index - 1];
    if (
      candidate.length !== 1 ||
      !isHeaderGapLine(candidate[0]) ||
      !header ||
      header.length < 2 ||
      !isHeaderTextRow(header) ||
      !isWithinLeadingGap(header, candidate) ||
      !isLeading(header)
    ) {
      break;
    }
    leadingRows.unshift(candidate);
    nextIncluded = candidate;
    gapRow = candidate;
  }

  if (gapRow) markHeaderRowsAbove(leadingRows, gapRow);
  return leadingRows.length > 0 ? [...leadingRows, ...rows] : rows;
}

const headerRowsAboveGap = new WeakSet<object>();

/**
 * Rows above a gap line taken with the header are the header, whatever
 * their cells hold (a `2022 | 2023` year row is not the table's first
 * data row): column assignment starts the body below them.
 */
export function markHeaderRowsAbove<T extends object>(rows: readonly T[], gapRow: T): void {
  for (const row of rows) {
    if (row === gapRow) break;
    headerRowsAboveGap.add(row);
  }
}

export function markHeaderRow(row: object): void {
  headerRowsAboveGap.add(row);
}

export function isHeaderRowAboveGap(row: object): boolean {
  return headerRowsAboveGap.has(row);
}

/** Where the body may start at the earliest: below the last row marked as header. */
export function headerRowsEnd(rows: readonly object[]): number {
  let end = 0;
  rows.forEach((row, index) => {
    if (headerRowsAboveGap.has(row)) end = index + 1;
  });
  return end;
}

/** A line that may sit between a column header and the table's rows: short, a label, not a caption. */
export function isHeaderGapLine(line: LayoutLine): boolean {
  return isCompactLeadingTableCell(line) && !isTableNumericCell(line.text) && !isCaptionHeadingText(line.text);
}

/**
 * A header row is words, not mostly values: the line above a gap line may
 * otherwise be the last row of the table before this one.
 */
export function isHeaderTextRow(row: readonly LayoutLine[]): boolean {
  return row.filter((line) => isTableValueCell(line.text)).length * 2 < row.length;
}

function isWithinLeadingGap(row: LayoutLine[], below: LayoutLine[]): boolean {
  const verticalGap = rowY(below) - rowBottom(row);
  return verticalGap >= -TABLE_LEADING_ROW_MAX_OVERLAP_PT && verticalGap <= TABLE_LEADING_ROW_MAX_GAP_PT;
}

function isFoldedInto(row: readonly LayoutLine[], owner: readonly LayoutLine[]): boolean {
  return row.every((line) =>
    owner.some(
      (cell) =>
        cell !== line &&
        line.x >= cell.x - 1 &&
        line.y >= cell.y - 1 &&
        line.x + line.width <= cell.x + cell.width + 1 &&
        line.y + line.height <= cell.y + cell.height + 1,
    ),
  );
}

function firstRowNumericColumnRights(rows: LayoutLine[][], minColumns: number): number[] {
  if (rows.length < TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROWS) return [];
  const firstRow = rows[0];
  if (!firstRow) return [];
  const numericCells = firstRow.filter((line) => isTableNumericCell(line.text));
  if (numericCells.length < minColumns) return [];
  return numericCells.map((line, index) => numericColumnMatchRight(line, numericCells[index + 1]));
}

function twoColumnDateHeaderRights(rows: LayoutLine[][]): number[] {
  const recurring = recurringNumericColumnRights(rows, {
    minColumns: TABLE_LEADING_DATE_HEADER_MIN_COLUMNS,
    minRows: Math.min(rows.length, Math.max(2, Math.ceil(rows.length * TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROW_RATIO))),
  });
  if (recurring.length >= TABLE_LEADING_DATE_HEADER_MIN_COLUMNS) return recurring;
  return firstRowNumericColumnRights(rows, TABLE_LEADING_DATE_HEADER_MIN_COLUMNS);
}

function recurringLabelColumnLeft(rows: LayoutLine[][]): number | undefined {
  const lefts = rows
    .map((row) => row.find((line) => !isTableNumericCell(line.text) && !isCurrencyOnlyCell(line.text)))
    .filter((line): line is LayoutLine => line !== undefined && isCompactTableLabelCell(line))
    .map((line) => line.x);
  if (lefts.length < 2) return undefined;
  return medianNumber(lefts);
}

function isLeadingTableRow(
  row: LayoutLine[],
  tableBox: BBox,
  numericColumnRights: number[],
  dateHeaderColumnRights: number[],
  labelLeft: number | undefined,
  allowSingleLabelHeader: boolean,
): boolean {
  if (row.length === 0) return false;
  // `Table 1 (continued)` names the table; it is not one of its rows.
  if (isCaptionHeadingText(row[0].text)) return false;
  if (!row.every(isCompactLeadingTableCell)) return false;

  const rowBox = unionBox(row);
  if (!hasTableBandOverlap(rowBox, tableBox)) return false;

  const alignedNumericCells = row.filter((line) => {
    if (!isTableNumericCell(line.text)) return false;
    const right = numericColumnMatchRight(line, undefined);
    return numericColumnRights.some(
      (columnRight) => Math.abs(columnRight - right) <= TABLE_RECURRING_NUMERIC_COLUMN_TOLERANCE_PT,
    );
  });
  const labelAligned =
    labelLeft !== undefined &&
    row.some(
      (line) => Math.abs(line.x - labelLeft) <= TABLE_LEADING_ROW_X_TOLERANCE_PT && isCompactTableLabelCell(line),
    );

  if (alignedNumericCells.length > 0) return row.length >= 2 || labelAligned;
  if (numericColumnRights.length >= TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS && row.length >= 2) return true;
  if (isSingleDateHeaderOverNumericColumns(row, dateHeaderColumnRights)) return true;
  return (
    numericColumnRights.length >= TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS && allowSingleLabelHeader && labelAligned
  );
}

function isSingleDateHeaderOverNumericColumns(row: LayoutLine[], numericColumnRights: number[]): boolean {
  if (row.length !== 1 || numericColumnRights.length < TABLE_LEADING_DATE_HEADER_MIN_COLUMNS) return false;
  const line = row[0];
  if (!line) return false;
  const text = line.text.replace(/\s+/gu, ' ').trim();
  if (!TABLE_LEADING_DATE_HEADER_PATTERN.test(text)) return false;

  const left = line.x;
  const right = line.x + line.width;
  const minNumericRight = Math.min(...numericColumnRights);
  const maxNumericRight = Math.max(...numericColumnRights);
  return (
    right >= minNumericRight - TABLE_LEADING_DATE_HEADER_X_TOLERANCE_PT &&
    left <= maxNumericRight + TABLE_LEADING_DATE_HEADER_X_TOLERANCE_PT
  );
}

function isCompactLeadingTableCell(line: LayoutLine): boolean {
  const text = line.text.replace(/\s+/g, ' ').trim();
  if (text.length === 0 || text.length > TABLE_LEADING_HEADER_MAX_CHARS) return false;
  if (isTableNumericCell(text) || isCurrencyOnlyCell(text)) return true;
  if (!/[\p{L}]/u.test(text)) return false;
  if (/[!?:;]/u.test(text) || /\.(?:\s|$)/u.test(text)) return false;
  if (text.split(/\s+/).filter(Boolean).length > TABLE_LEADING_HEADER_MAX_WORDS) return false;
  return line.width <= TABLE_LEADING_HEADER_MAX_WIDTH_PT;
}

function hasTableBandOverlap(rowBox: BBox, tableBox: BBox): boolean {
  const left = tableBox.x - TABLE_LEADING_ROW_X_TOLERANCE_PT;
  const right = tableBox.x + tableBox.width + TABLE_LEADING_ROW_X_TOLERANCE_PT;
  const overlap = Math.min(rowBox.x + rowBox.width, right) - Math.max(rowBox.x, left);
  return overlap > 0 && overlap >= Math.min(rowBox.width, tableBox.width) * 0.6;
}

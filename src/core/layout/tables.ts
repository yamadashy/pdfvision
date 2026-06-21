import type { LayoutLine, LayoutTable } from '../../types/index.js';
import { type BBox, mode, round2, unionBox } from './geometry.js';
import {
  isCurrencyOnlyCell,
  isTableNumericCell,
  normalizeTableCurrencyCells,
  numericColumnMatchRight,
} from './tableCells.js';

export { isTableNumericCell } from './tableCells.js';

interface IndexedLayoutRow {
  row: LayoutLine[];
  index: number;
}

const TABLE_ROW_MIN_CELLS = 3;
const TABLE_ROW_MIN_NUMERIC_CELLS = 2;
const TWO_COLUMN_NUMERIC_TABLE_MIN_ROWS = 4;
const DECORATIVE_DOTTED_RULE_MIN_DOTS = 8;
const TABLE_GROUP_MAX_ROW_GAP_PT = 48;
const TABLE_ROW_CADENCE_MIN_MATCH_RATIO = 0.65;
const TABLE_ROW_CADENCE_TOLERANCE_RATIO = 0.25;
const TABLE_ROW_CADENCE_MIN_TOLERANCE_PT = 2;
const TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROWS = 4;
const TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS = 3;
const TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROW_RATIO = 0.6;
const TABLE_RECURRING_NUMERIC_COLUMN_TOLERANCE_PT = 10;
const TABLE_LEADING_ROW_MAX_GAP_PT = 24;
const TABLE_LEADING_ROW_MAX_OVERLAP_PT = 4;
const TABLE_LEADING_ROW_X_TOLERANCE_PT = 14;
const TABLE_LEADING_HEADER_MAX_CHARS = 80;
const TABLE_LEADING_HEADER_MAX_WORDS = 6;
const TABLE_LEADING_HEADER_MAX_WIDTH_PT = 180;
const TABLE_ROW_TOP_ALIGNMENT_RATIO = 0.5;
const TABLE_ROW_VERTICAL_OVERLAP_RATIO = 0.35;

function canShareTableRow(a: LayoutLine, b: LayoutLine): boolean {
  const minHeight = Math.max(Math.min(a.height, b.height), 1);
  if (Math.abs(a.y - b.y) < minHeight * TABLE_ROW_TOP_ALIGNMENT_RATIO) return true;
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlap >= minHeight * TABLE_ROW_VERTICAL_OVERLAP_RATIO;
}

export function detectLayoutTables(lines: LayoutLine[]): LayoutTable[] | undefined {
  const tableLines = lines.filter((line) => !isDecorativeDottedRuleLine(line));
  const allRowGroups = groupLinesByTableRow(tableLines).map((row) => row.sort((a, b) => a.x - b.x));
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
    result.push(toLayoutTable(attachLeadingTableRows(rows, table[0]?.index ?? 0, allRowGroups)));
  }
  return result.length > 0 ? result : undefined;
}

const TABLE_SIDE_PANEL_MIN_GAP_PT = 40;
const TABLE_COMPACT_LABEL_MAX_WIDTH_PT = 140;
const TABLE_COMPACT_LABEL_MAX_CHARS = 60;

function groupLinesByTableRow(lines: LayoutLine[]): LayoutLine[][] {
  const rows: LayoutLine[][] = [];
  for (const line of [...lines].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find((candidate) => canShareTableRow(line, candidate[0]));
    if (row) row.push(line);
    else rows.push([line]);
  }
  return rows;
}

function isDecorativeDottedRuleLine(line: LayoutLine): boolean {
  const compact = line.text.replace(/\s+/g, '');
  if (compact.length < DECORATIVE_DOTTED_RULE_MIN_DOTS) return false;
  return /^[.\u00b7\u2022\u2027\u2219]+$/u.test(compact);
}

function tableCandidateRow(row: LayoutLine[]): LayoutLine[] | undefined {
  if (!isLikelyTableRow(row)) return undefined;
  for (let start = 1; start < row.length; start++) {
    const suffix = row.slice(start);
    if (!isLikelyTableRow(suffix)) continue;
    if (!isTableLikeSuffix(suffix)) continue;
    if (canTrimSidePanelTableSuffix(row, start, suffix)) return suffix;
  }
  if (isTableLikeSuffix(row)) return row;
  for (let end = row.length - 1; end >= TABLE_ROW_MIN_CELLS; end--) {
    const prefix = row.slice(0, end);
    const trailing = row.slice(end);
    if (!isLikelyTableRow(prefix)) continue;
    if (!isTableLikeSuffix(prefix)) continue;
    if (canTrimTrailingProseTablePrefix(prefix, trailing)) return prefix;
  }
  return row;
}

function isLikelyTableRow(row: LayoutLine[]): boolean {
  const numericCells = row.filter((line) => isTableNumericCell(line.text)).length;
  if (row.length === TABLE_ROW_MIN_NUMERIC_CELLS) return numericCells === TABLE_ROW_MIN_NUMERIC_CELLS;
  if (row.length < TABLE_ROW_MIN_CELLS) return false;
  return numericCells >= TABLE_ROW_MIN_NUMERIC_CELLS;
}

function isTableLikeSuffix(row: LayoutLine[]): boolean {
  const numericCells = row.filter((line) => isTableNumericCell(line.text)).length;
  if (numericCells < TABLE_ROW_MIN_NUMERIC_CELLS) return false;
  return row.every(
    (line) => isTableNumericCell(line.text) || isCurrencyOnlyCell(line.text) || isCompactTableLabelCell(line),
  );
}

function isTwoColumnNumericOnlyTable(rows: LayoutLine[][]): boolean {
  return rows.every((row) => {
    const normalized = normalizeTableCurrencyCells(row);
    return normalized.length === 2 && normalized.every((cell) => isTableNumericCell(cell.text));
  });
}

function isCompactTableLabelCell(line: LayoutLine): boolean {
  const text = line.text.replace(/\s+/g, ' ').trim();
  if (text.length === 0 || text.length > TABLE_COMPACT_LABEL_MAX_CHARS) return false;
  if (!/[\p{L}]/u.test(text)) return false;
  return line.width <= TABLE_COMPACT_LABEL_MAX_WIDTH_PT;
}

function hasSidePanelTableGap(row: LayoutLine[], start: number): boolean {
  const prev = row[start - 1];
  const cur = row[start];
  if (!prev || !cur) return false;
  const gap = cur.x - (prev.x + prev.width);
  return gap >= Math.max(TABLE_SIDE_PANEL_MIN_GAP_PT, cur.fontSize * 4);
}

function canTrimSidePanelTableSuffix(row: LayoutLine[], start: number, suffix: LayoutLine[]): boolean {
  if (!hasSidePanelTableGap(row, start)) return false;
  const firstSuffixCell = suffix[0];
  const previousCell = row[start - 1];
  const startsWithCompactLabel =
    firstSuffixCell !== undefined &&
    !isTableNumericCell(firstSuffixCell.text) &&
    isCompactTableLabelCell(firstSuffixCell);
  if (start === 1) return startsWithCompactLabel && isProseBeforeSidePanel(row[0]);
  if (!startsWithCompactLabel && previousCell && isTableNumericCell(previousCell.text)) return false;
  return startsWithCompactLabel || row.slice(0, start).some(isProseBeforeSidePanel);
}

function canTrimTrailingProseTablePrefix(prefix: LayoutLine[], trailing: LayoutLine[]): boolean {
  const lastPrefixCell = prefix.at(-1);
  const firstTrailingCell = trailing[0];
  if (!lastPrefixCell || !firstTrailingCell) return false;
  const gap = firstTrailingCell.x - (lastPrefixCell.x + lastPrefixCell.width);
  if (gap < Math.max(TABLE_SIDE_PANEL_MIN_GAP_PT, firstTrailingCell.fontSize * 4)) return false;
  return trailing.every(isProseBeforeSidePanel);
}

function isProseBeforeSidePanel(line: LayoutLine): boolean {
  const text = line.text.replace(/\s+/g, ' ').trim();
  if (!/[\p{L}]/u.test(text)) return false;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < 4) return false;
  return line.width > TABLE_COMPACT_LABEL_MAX_WIDTH_PT || /[.!?:;]/u.test(text);
}

function attachNumericContinuationRows(
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
  for (let index = firstIndex; index < scanEndIndex; index++) {
    const baseRow = baseRowsByIndex.get(index);
    if (baseRow) {
      rows.push(baseRow);
      previousIncluded = baseRow;
      continue;
    }

    if (!previousIncluded) continue;
    const candidate = allRows[index];
    if (!candidate) continue;
    const verticalGap = rowY(candidate) - rowBottom(previousIncluded);
    if (index > lastBaseIndex && verticalGap > TABLE_GROUP_MAX_ROW_GAP_PT) break;
    if (verticalGap > TABLE_GROUP_MAX_ROW_GAP_PT) continue;
    if (!isAlignedNumericContinuationRow(candidate, numericColumnRights)) continue;

    rows.push(candidate);
    previousIncluded = candidate;
  }
  return rows;
}

function attachLeadingTableRows(rows: LayoutLine[][], firstBaseIndex: number, allRows: LayoutLine[][]): LayoutLine[][] {
  const numericColumnRights = recurringNumericColumnRights(rows, {
    minColumns: TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS,
    minRows: Math.min(rows.length, Math.max(2, Math.ceil(rows.length * TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROW_RATIO))),
  });
  const leadingColumnRights =
    numericColumnRights.length >= TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS
      ? numericColumnRights
      : firstRowNumericColumnRights(rows);
  if (leadingColumnRights.length < TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS) return rows;

  const labelLeft = recurringLabelColumnLeft(rows);
  const tableBox = unionBox(rows.flat());
  const leadingRows: LayoutLine[][] = [];
  let nextIncluded = rows[0];

  for (let index = firstBaseIndex - 1; index >= 0; index--) {
    const candidate = allRows[index];
    if (!candidate || !nextIncluded) break;

    const verticalGap = rowY(nextIncluded) - rowBottom(candidate);
    if (verticalGap < -TABLE_LEADING_ROW_MAX_OVERLAP_PT || verticalGap > TABLE_LEADING_ROW_MAX_GAP_PT) break;
    if (!isLeadingTableRow(candidate, tableBox, leadingColumnRights, labelLeft, leadingRows.length > 0)) break;

    leadingRows.unshift(candidate);
    nextIncluded = candidate;
  }

  return leadingRows.length > 0 ? [...leadingRows, ...rows] : rows;
}

function firstRowNumericColumnRights(rows: LayoutLine[][]): number[] {
  if (rows.length < TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROWS) return [];
  const firstRow = rows[0];
  if (!firstRow) return [];
  const numericCells = firstRow.filter((line) => isTableNumericCell(line.text));
  if (numericCells.length < TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS) return [];
  return numericCells.map((line, index) => numericColumnMatchRight(line, numericCells[index + 1]));
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
  labelLeft: number | undefined,
  allowSingleLabelHeader: boolean,
): boolean {
  if (row.length === 0) return false;
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
  if (row.length >= 2) return true;
  return allowSingleLabelHeader && labelAligned;
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

function recurringNumericColumnRights(
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

function attachLabelContinuationRows(row: LayoutLine[], rowIndex: number, allRows: LayoutLine[][]): LayoutLine[] {
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

function mergeLineTexts(lines: LayoutLine[]): LayoutLine {
  const sorted = [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
  const box = unionBox(sorted);
  return {
    text: sorted.map((line) => line.text).join(' '),
    ...box,
    fontSize: round2(mode(sorted.map((line) => line.fontSize))),
  };
}

function hasRegularTableRowCadence(rows: LayoutLine[][]): boolean {
  const gaps = rowGaps(rows);
  if (gaps.length < 2) return true;
  if (cadenceMatchRatio(gaps) >= TABLE_ROW_CADENCE_MIN_MATCH_RATIO) return true;
  return hasRecurringNumericColumns(rows);
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

function medianNumber(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
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
  return row.some((line) => !isTableNumericCell(line.text) && /[\p{L}]/u.test(line.text));
}

function rowY(row: LayoutLine[]): number {
  return Math.min(...row.map((line) => line.y));
}

function rowBottom(row: LayoutLine[]): number {
  return Math.max(...row.map((line) => line.y + line.height));
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

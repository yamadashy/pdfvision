import type { LayoutLine } from '../../types/index.js';
import { isCurrencyOnlyCell, isTableNumericCell } from './tableCells.js';

const TABLE_ROW_MIN_CELLS = 3;
const TABLE_ROW_MIN_NUMERIC_CELLS = 2;
const TABLE_SIDE_PANEL_MIN_GAP_PT = 40;
const TABLE_COMPACT_LABEL_MAX_WIDTH_PT = 140;
const TABLE_COMPACT_LABEL_MAX_CHARS = 60;

export function tableCandidateRow(row: LayoutLine[]): LayoutLine[] | undefined {
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

export function isCompactTableLabelCell(line: LayoutLine): boolean {
  const text = line.text.replace(/\s+/g, ' ').trim();
  if (text.length === 0 || text.length > TABLE_COMPACT_LABEL_MAX_CHARS) return false;
  if (!/[\p{L}]/u.test(text)) return false;
  return line.width <= TABLE_COMPACT_LABEL_MAX_WIDTH_PT;
}

export function firstTableLabelCell(row: LayoutLine[]): LayoutLine | undefined {
  return row.find(isRestorableTableLabelCell);
}

export function isNumericOnlyTableRow(row: LayoutLine[]): boolean {
  return (
    row.filter((line) => isTableNumericCell(line.text)).length >= TABLE_ROW_MIN_NUMERIC_CELLS &&
    row.every((line) => isTableNumericCell(line.text) || isCurrencyOnlyCell(line.text))
  );
}

export function isRestorableTableLabelCell(line: LayoutLine): boolean {
  return !isTableNumericCell(line.text) && !isCurrencyOnlyCell(line.text) && /[\p{L}]/u.test(line.text);
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
  if (previousCell && isCurrencyOnlyCell(previousCell.text)) return false;
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

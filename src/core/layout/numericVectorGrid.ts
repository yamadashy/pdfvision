import type { LayoutLine } from '../../types/index.js';
import { isTableNumericCell } from './tableCells.js';

const TINY_VECTOR_NUMERIC_MIN_LINES = 40;
const TINY_VECTOR_NUMERIC_MIN_COLUMNS = 6;
const TINY_VECTOR_NUMERIC_MIN_ROWS = 6;
const TINY_VECTOR_NUMERIC_MIN_RATIO = 0.75;
const TINY_VECTOR_FRAGMENT_MIN_LINES = 8;
const TINY_VECTOR_FRAGMENT_MIN_COLUMNS = 3;
const TINY_VECTOR_FRAGMENT_MIN_ROWS = 2;
const TINY_VECTOR_FRAGMENT_MIN_NUMERIC_RATIO = 0.6;
const TINY_VECTOR_FRAGMENT_MIN_TINY_NUMERIC_RATIO = 0.7;
const TINY_VECTOR_NUMERIC_MAX_FONT_SIZE_PT = 6.5;
const TINY_VECTOR_LABEL_MAX_FONT_SIZE_PT = 4.5;
const TINY_VECTOR_NUMERIC_MAX_HEIGHT_PT = 6.5;
const TINY_VECTOR_LABEL_MAX_HEIGHT_PT = 5.5;
const TINY_VECTOR_NUMERIC_MAX_WIDTH_PT = 10.5;
const TINY_VECTOR_LABEL_MAX_WIDTH_PT = 90;
const TINY_VECTOR_NUMERIC_COLUMN_TOLERANCE_PT = 12;
const TINY_VECTOR_NUMERIC_ROW_TOLERANCE_PT = 4;
const NUMERIC_LEGEND_MIN_LINES = 5;
const NUMERIC_LEGEND_MIN_COLUMNS = 4;
const NUMERIC_LEGEND_MAX_ROWS = 4;
const NUMERIC_LEGEND_MIN_SMALL_RATIO = 0.75;
const NUMERIC_LEGEND_MAX_FONT_SIZE_PT = 7;
const NUMERIC_LEGEND_MAX_HEIGHT_PT = 8;
const NUMERIC_LEGEND_MIN_ROW_GAP_PT = 36;
const NUMERIC_LEGEND_TALL_LABEL_MAX_WIDTH_PT = 16;
const NUMERIC_LEGEND_TALL_LABEL_MIN_HEIGHT_PT = 40;
const NUMERIC_LEGEND_TALL_LABEL_MIN_ASPECT = 3;

export function isLikelyTinyNumericVectorGrid(lines: readonly LayoutLine[]): boolean {
  const numericLines = lines.filter((line) => isTableNumericCell(line.text));
  if (numericLines.length < TINY_VECTOR_NUMERIC_MIN_LINES) return false;

  const tinyNumericLines = numericLines.filter(isTinyVectorNumericCell);
  if (tinyNumericLines.length / numericLines.length < TINY_VECTOR_NUMERIC_MIN_RATIO) return false;

  const columns = distinctCenters(
    tinyNumericLines.map((line) => line.x + line.width / 2),
    TINY_VECTOR_NUMERIC_COLUMN_TOLERANCE_PT,
  );
  if (columns.length < TINY_VECTOR_NUMERIC_MIN_COLUMNS) return false;

  const rows = distinctCenters(
    tinyNumericLines.map((line) => line.y + line.height / 2),
    TINY_VECTOR_NUMERIC_ROW_TOLERANCE_PT,
  );
  return rows.length >= TINY_VECTOR_NUMERIC_MIN_ROWS;
}

export function isLikelyTinyNumericChartFragment(lines: readonly LayoutLine[]): boolean {
  if (lines.length < TINY_VECTOR_FRAGMENT_MIN_LINES) return false;

  const numericLines = lines.filter((line) => isTableNumericCell(line.text));
  if (numericLines.length / lines.length < TINY_VECTOR_FRAGMENT_MIN_NUMERIC_RATIO) return false;

  const tinyNumericLines = numericLines.filter(isTinyVectorNumericCell);
  if (tinyNumericLines.length / numericLines.length < TINY_VECTOR_FRAGMENT_MIN_TINY_NUMERIC_RATIO) return false;

  const columns = distinctCenters(
    tinyNumericLines.map((line) => line.x + line.width / 2),
    TINY_VECTOR_NUMERIC_COLUMN_TOLERANCE_PT,
  );
  if (columns.length < TINY_VECTOR_FRAGMENT_MIN_COLUMNS) return false;

  const rows = distinctCenters(
    tinyNumericLines.map((line) => line.y + line.height / 2),
    TINY_VECTOR_NUMERIC_ROW_TOLERANCE_PT,
  );
  return rows.length >= TINY_VECTOR_FRAGMENT_MIN_ROWS;
}

export function isLikelySparseNumericLegendFragment(lines: readonly LayoutLine[]): boolean {
  const numericLines = lines.filter((line) => isTableNumericCell(line.text));
  if (numericLines.length < NUMERIC_LEGEND_MIN_LINES) return false;

  const smallNumericLines = numericLines.filter(isSmallLegendNumericLine);
  if (smallNumericLines.length / numericLines.length < NUMERIC_LEGEND_MIN_SMALL_RATIO) return false;

  const columns = distinctCenters(
    smallNumericLines.map((line) => line.x + line.width / 2),
    TINY_VECTOR_NUMERIC_COLUMN_TOLERANCE_PT,
  );
  if (columns.length < NUMERIC_LEGEND_MIN_COLUMNS) return false;

  const rows = distinctCenters(
    smallNumericLines.map((line) => line.y + line.height / 2),
    TINY_VECTOR_NUMERIC_ROW_TOLERANCE_PT,
  );
  if (rows.length === 0 || rows.length > NUMERIC_LEGEND_MAX_ROWS) return false;

  return hasTallSideLabel(lines) || hasSparseLegendRowCadence(rows);
}

export function isLikelyMirroredChartAxisTable(lines: readonly LayoutLine[]): boolean {
  if (lines.length < 12) return false;

  const rows = groupRows(lines);
  const mirroredRows = rows.filter(isMirroredAxisLabelRow).length;
  if (mirroredRows < Math.max(6, Math.ceil(rows.length * 0.3))) return false;

  const axisTickRows = rows.filter(isAxisTickRow).length;
  if (axisTickRows === 0) return false;

  const dataLikeRows = rows.filter(
    (row) => row.filter((line) => isTableNumericCell(line.text) && !normalizedAxisLabel(line.text)).length >= 2,
  ).length;
  return dataLikeRows <= axisTickRows + 2;
}

export function isTinyVectorNumericCell(line: LayoutLine): boolean {
  const text = line.text.trim();
  if (!isTinyVectorNumericText(text)) return false;
  return (
    (line.fontSize <= TINY_VECTOR_NUMERIC_MAX_FONT_SIZE_PT &&
      line.height <= TINY_VECTOR_NUMERIC_MAX_HEIGHT_PT &&
      line.width <= TINY_VECTOR_NUMERIC_MAX_WIDTH_PT) ||
    (line.fontSize <= TINY_VECTOR_LABEL_MAX_FONT_SIZE_PT &&
      line.height <= TINY_VECTOR_LABEL_MAX_HEIGHT_PT &&
      line.width <= TINY_VECTOR_LABEL_MAX_WIDTH_PT)
  );
}

function isSmallLegendNumericLine(line: LayoutLine): boolean {
  return (
    line.fontSize <= NUMERIC_LEGEND_MAX_FONT_SIZE_PT &&
    line.height <= NUMERIC_LEGEND_MAX_HEIGHT_PT &&
    isTinyVectorNumericText(line.text.trim())
  );
}

function hasTallSideLabel(lines: readonly LayoutLine[]): boolean {
  return lines.some((line) => {
    if (isTableNumericCell(line.text)) return false;
    if (!/[\p{L}]/u.test(line.text)) return false;
    if (line.width > NUMERIC_LEGEND_TALL_LABEL_MAX_WIDTH_PT) return false;
    if (line.height < NUMERIC_LEGEND_TALL_LABEL_MIN_HEIGHT_PT) return false;
    return line.height / Math.max(line.width, 1) >= NUMERIC_LEGEND_TALL_LABEL_MIN_ASPECT;
  });
}

function hasSparseLegendRowCadence(rowCenters: readonly number[]): boolean {
  if (rowCenters.length < 2) return false;
  const sorted = [...rowCenters].sort((a, b) => a - b);
  const gaps = sorted.slice(1).map((center, index) => center - sorted[index]);
  return gaps.some((gap) => gap >= NUMERIC_LEGEND_MIN_ROW_GAP_PT);
}

function groupRows(lines: readonly LayoutLine[]): LayoutLine[][] {
  const rows: LayoutLine[][] = [];
  for (const line of [...lines].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find(
      (candidate) => Math.abs(rowCenter(candidate) - centerY(line)) <= TINY_VECTOR_NUMERIC_ROW_TOLERANCE_PT,
    );
    if (row) row.push(line);
    else rows.push([line]);
  }
  return rows;
}

function isMirroredAxisLabelRow(row: readonly LayoutLine[]): boolean {
  if (row.filter((line) => isTableNumericCell(line.text) && !normalizedAxisLabel(line.text)).length > 1) return false;
  const labels = new Map<string, number>();
  for (const line of row) {
    const label = normalizedAxisLabel(line.text);
    if (!label) continue;
    labels.set(label, (labels.get(label) ?? 0) + 1);
  }
  return [...labels.values()].some((count) => count >= 2);
}

function isAxisTickRow(row: readonly LayoutLine[]): boolean {
  const numericLines = row.filter((line) => isTableNumericCell(line.text) && !normalizedAxisLabel(line.text));
  return numericLines.length >= 6 && numericLines.length / row.length >= 0.75;
}

function normalizedAxisLabel(text: string): string | undefined {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  if (normalized.length === 0 || normalized.length > 24) return undefined;
  if (!/\p{N}/u.test(normalized)) return undefined;
  if (!/[~〜\-–—]/u.test(normalized) && !/(?:歳|才|years?|yrs?)\b/iu.test(normalized)) return undefined;
  return normalized
    .replace(/[〜–—]/gu, '~')
    .replace(/\s*~\s*/gu, '~')
    .toLocaleLowerCase();
}

function rowCenter(row: readonly LayoutLine[]): number {
  return row.reduce((sum, line) => sum + centerY(line), 0) / Math.max(row.length, 1);
}

function centerY(line: LayoutLine): number {
  return line.y + line.height / 2;
}

function isTinyVectorNumericText(text: string): boolean {
  if (/^[+-]?(?:\d+(?:\.\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?)$/u.test(text)) return true;
  const tokens = text.split(/\s+/u).filter(Boolean);
  if (tokens.length < 2) return false;
  return tokens.every((token) => /^[+-]?(?:\d+(?:\.\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?)$/u.test(token));
}

function distinctCenters(values: number[], tolerance: number): number[] {
  const centers: number[] = [];
  for (const value of values.sort((a, b) => a - b)) {
    const center = centers.find((candidate) => Math.abs(candidate - value) <= tolerance);
    if (center === undefined) centers.push(value);
  }
  return centers;
}

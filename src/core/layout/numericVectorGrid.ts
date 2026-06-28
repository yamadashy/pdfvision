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

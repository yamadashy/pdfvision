import type { LayoutLine } from '../../types/index.js';
import { round2 } from './geometry.js';

export function isTableNumericCell(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || !/\d/u.test(trimmed)) return false;
  const withoutRatioSuffix = trimmed.replace(/(?<=\d)\s*[xX]$/u, '');
  const withoutScoreWords = withoutRatioSuffix
    .replace(/\b(?:below|under|over|above|about|approximately)\s+(?=\d)/giu, '')
    .replace(/(?<=\d)(?:st|nd|rd|th)\b/giu, '');
  return withoutScoreWords.replace(/[0-9.,()%$¥€£+\-/~\s·⋅∙×^]/gu, '').length === 0;
}

const TABLE_PLACEHOLDER_PATTERN = /^(?:[-‐‑‒–—―−]{1,3}|n\/a|n\.a\.)$/iu;
const TABLE_FOOTNOTE_SUFFIX_PATTERN = /\s+\([a-z]\)$/u;
const TABLE_LEADING_CURRENCY_PATTERN = /^[$¥€£]\s*/u;
const TABLE_TRAILING_CURRENCY_PATTERN = /\s*[$¥€£]$/u;

/** A dash-like or `n/a` marker standing in for an empty value. */
export function isTablePlaceholderCell(text: string): boolean {
  return TABLE_PLACEHOLDER_PATTERN.test(text.trim());
}

/**
 * A cell that occupies a value column: a number or an empty-value
 * placeholder, optionally prefixed by a currency symbol, followed by a
 * lettered footnote marker such as `(b)`, or followed by the currency symbol
 * of the next column (`10,246 (b) $`).
 */
export function isTableValueCell(text: string): boolean {
  const core = text
    .trim()
    .replace(TABLE_TRAILING_CURRENCY_PATTERN, '')
    .replace(TABLE_FOOTNOTE_SUFFIX_PATTERN, '')
    .replace(TABLE_LEADING_CURRENCY_PATTERN, '');
  return isTableNumericCell(core) || isTablePlaceholderCell(core);
}

export function numericColumnMatchRight(cell: LayoutLine, nextNumericCell: LayoutLine | undefined): number {
  const trailing = trailingCurrencyForNextValue(cell.text, nextNumericCell);
  if (!trailing) return cell.x + cell.width;

  const trimmed = cell.text.trim();
  const valueText = trimmed.slice(0, -trailing.length).trimEnd();
  if (trimmed.length === 0 || valueText.length === 0) return cell.x + cell.width;
  return cell.x + cell.width * (valueText.length / trimmed.length);
}

export function normalizeTableCurrencyCells(row: LayoutLine[]): LayoutLine[] {
  const normalized: LayoutLine[] = [];
  let pendingCurrency: string | undefined;
  for (let i = 0; i < row.length; i++) {
    const cell = row[i];
    const text = cell.text.trim();
    if (isCurrencyOnlyCell(text) && isTableValueCell(row[i + 1]?.text ?? '')) {
      pendingCurrency = text;
      continue;
    }

    const trailing = trailingCurrencyForNextValue(text, row[i + 1]);
    const textWithoutTrailing = trailing ? text.slice(0, -trailing.length).trimEnd() : text;
    const nextText = pendingCurrency ? `${pendingCurrency} ${textWithoutTrailing}` : textWithoutTrailing;
    // The trailing currency belongs to the next column; keep it out of this
    // cell's box so the box does not reach into that column.
    const width =
      trailing && text.length > 0 ? round2(cell.width * (textWithoutTrailing.length / text.length)) : cell.width;
    normalized.push({ ...cell, text: nextText, width });
    pendingCurrency = trailing;
  }
  if (pendingCurrency) {
    const fallbackY = rowY(row);
    normalized.push({
      text: pendingCurrency,
      x: row.at(-1)?.x ?? 0,
      y: fallbackY,
      width: 0,
      height: rowBottom(row) - fallbackY,
      fontSize: row.at(-1)?.fontSize ?? 0,
    });
  }
  return normalized;
}

export function isCurrencyOnlyCell(text: string): boolean {
  return /^[$¥€£]$/u.test(text.trim());
}

function trailingCurrencyForNextValue(text: string, next: LayoutLine | undefined): string | undefined {
  if (!next || !isTableValueCell(next.text)) return undefined;
  const match = /^(.+?)\s*([$¥€£])$/u.exec(text.trim());
  if (!match) return undefined;
  return isTableValueCell(match[1]) ? match[2] : undefined;
}

function rowY(row: LayoutLine[]): number {
  return Math.min(...row.map((line) => line.y));
}

function rowBottom(row: LayoutLine[]): number {
  return Math.max(...row.map((line) => line.y + line.height));
}

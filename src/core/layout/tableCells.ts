import type { LayoutLine } from '../../types/index.js';

export function isTableNumericCell(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || !/\d/u.test(trimmed)) return false;
  const withoutRatioSuffix = trimmed.replace(/(?<=\d)\s*[xX]$/u, '');
  const withoutScoreWords = withoutRatioSuffix
    .replace(/\b(?:below|under|over|above|about|approximately)\s+(?=\d)/giu, '')
    .replace(/(?<=\d)(?:st|nd|rd|th)\b/giu, '');
  return withoutScoreWords.replace(/[0-9.,()%$¥€£+\-/~\s·⋅∙×^]/gu, '').length === 0;
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
    if (isCurrencyOnlyCell(text) && isTableNumericCell(row[i + 1]?.text ?? '')) {
      pendingCurrency = text;
      continue;
    }

    const trailing = trailingCurrencyForNextValue(text, row[i + 1]);
    const textWithoutTrailing = trailing ? text.slice(0, -trailing.length).trimEnd() : text;
    const nextText = pendingCurrency ? `${pendingCurrency} ${textWithoutTrailing}` : textWithoutTrailing;
    normalized.push({ ...cell, text: nextText });
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
  if (!next || !isTableNumericCell(next.text)) return undefined;
  const match = /^(.+?)\s*([$¥€£])$/u.exec(text.trim());
  if (!match) return undefined;
  return isTableNumericCell(match[1]) ? match[2] : undefined;
}

function rowY(row: LayoutLine[]): number {
  return Math.min(...row.map((line) => line.y));
}

function rowBottom(row: LayoutLine[]): number {
  return Math.max(...row.map((line) => line.y + line.height));
}

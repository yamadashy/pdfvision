import type { TextSpan } from '../../types/index.js';

const COMPACT_TABLE_HEADER_MIN_SPANS = 3;
const COMPACT_TABLE_HEADER_MAX_SPANS = 8;
const COMPACT_TABLE_HEADER_MAX_CHARS = 32;
const COMPACT_TABLE_HEADER_MAX_WORDS = 4;
const COMPACT_TABLE_HEADER_MAX_ROW_WIDTH_RATIO = 0.75;
const COMPACT_TABLE_HEADER_MAX_GAP_RATIO = 2.25;
const COMPACT_TABLE_HEADER_BASE_MAX_GAP_PT = 28;
const COMPACT_TABLE_HEADER_MAX_GAP_PT = 72;
const COMPACT_TABLE_HEADER_TEXT_RE = /^[\p{L}\p{N}][\p{L}\p{N}\p{M}\s&.,'’()/%:+-]*$/u;

export function isLikelyCompactTableHeaderRow(
  spans: readonly TextSpan[],
  pageWidth: number,
  fontSizeFallbackPt: number,
): boolean {
  if (pageWidth <= 0) return false;
  if (spans.length < COMPACT_TABLE_HEADER_MIN_SPANS || spans.length > COMPACT_TABLE_HEADER_MAX_SPANS) return false;

  const first = spans[0];
  const last = spans.at(-1);
  if (!first || !last) return false;
  const rowWidth = last.x + last.width - first.x;
  if (rowWidth > pageWidth * COMPACT_TABLE_HEADER_MAX_ROW_WIDTH_RATIO) return false;

  let letterLabelCount = 0;
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const text = span.text.trim();
    if (!isCompactTableHeaderText(text)) return false;
    if (/\p{L}/u.test(text)) letterLabelCount++;

    const prev = spans[i - 1];
    if (prev) {
      const fontSize = span.fontSize || prev.fontSize || fontSizeFallbackPt;
      const gap = span.x - (prev.x + prev.width);
      const baseMaxGap = Math.max(fontSize * COMPACT_TABLE_HEADER_MAX_GAP_RATIO, COMPACT_TABLE_HEADER_BASE_MAX_GAP_PT);
      const maxGap = Math.max(fontSize * COMPACT_TABLE_HEADER_MAX_GAP_RATIO, COMPACT_TABLE_HEADER_MAX_GAP_PT);
      if (gap < 0 || gap > maxGap) {
        return false;
      }
      if (gap > baseMaxGap && (isSingleCjkGlyph(prev.text.trim()) || isSingleCjkGlyph(text))) {
        return false;
      }
    }
  }

  return letterLabelCount >= 2;
}

function isSingleCjkGlyph(text: string): boolean {
  return /^[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]$/u.test(text);
}

function isCompactTableHeaderText(text: string): boolean {
  if (text.length === 0 || text.length > COMPACT_TABLE_HEADER_MAX_CHARS) return false;
  if (text.split(/\s+/u).length > COMPACT_TABLE_HEADER_MAX_WORDS) return false;
  return COMPACT_TABLE_HEADER_TEXT_RE.test(text);
}

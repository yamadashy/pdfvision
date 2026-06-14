import { isCjkLeading } from './cjkJoin.js';

const DETACHED_TOKEN_RE = /^(?:https?:\/\/|www\.|doi:|arxiv:)/iu;
const PRECEDING_WORD_RE = /[\p{L}\p{N})\]]$/u;
const SEMANTIC_SPACE_MIN_GAP_RATIO = 0.1;
const ARABIC_SCRIPT_RE = /\p{Script=Arabic}/u;
const ARABIC_WORD_SPACE_MIN_GAP_RATIO = 0.12;
const LATIN_WORD_SPACE_MIN_GAP_RATIO = 0.18;
const LATIN_WORD_RE = /^[\p{Script=Latin}\p{M}]+$/u;
const LATIN_WORD_END_RE = /[\p{Script=Latin}\p{M}]$/u;
const LATIN_WORD_START_RE = /^[\p{Script=Latin}\p{M}]/u;
const WIDE_WORD_SPACING_MIN_SPANS = 3;
const WIDE_WORD_SPACING_MAX_SPANS = 6;
const WIDE_WORD_SPACING_MAX_LINE_WIDTH_RATIO = 0.85;
const WIDE_WORD_SPACING_MAX_GAP_PAGE_RATIO = 0.2;
const WIDE_WORD_SPACING_MAX_TOKEN_CHARS = 16;
const WIDE_WORD_SPACING_MAX_TOKEN_WIDTH_RATIO = 1.25;
const CJK_DISPLAY_SPACING_MIN_GAP_RATIO = 0.8;
const CJK_DISPLAY_SPACING_MAX_GAP_RATIO = 4;
const CJK_DISPLAY_SPACING_MAX_SPANS = 12;

interface WordSpacingSpan {
  text: string;
  x: number;
  width: number;
  fontSize?: number;
}

export function shouldInsertSemanticSpace(prevText: string, curText: string, gap: number, fontSize: number): boolean {
  const prev = prevText.trimEnd();
  const cur = curText.trimStart();
  if (prev.length === 0 || cur.length === 0) return false;

  if (gap > fontSize * ARABIC_WORD_SPACE_MIN_GAP_RATIO && ARABIC_SCRIPT_RE.test(prev) && ARABIC_SCRIPT_RE.test(cur)) {
    return true;
  }

  if (
    gap > fontSize * LATIN_WORD_SPACE_MIN_GAP_RATIO &&
    LATIN_WORD_END_RE.test(prev) &&
    LATIN_WORD_START_RE.test(cur)
  ) {
    return true;
  }

  if (gap <= fontSize * SEMANTIC_SPACE_MIN_GAP_RATIO) return false;

  return PRECEDING_WORD_RE.test(prev) && DETACHED_TOKEN_RE.test(cur);
}

export function isLikelyWideWordSpacingRow(spans: readonly WordSpacingSpan[], pageWidth: number): boolean {
  if (pageWidth <= 0) return false;
  if (spans.length < WIDE_WORD_SPACING_MIN_SPANS || spans.length > WIDE_WORD_SPACING_MAX_SPANS) return false;

  const sorted = [...spans].sort((a, b) => a.x - b.x);
  const first = sorted[0];
  const last = sorted.at(-1);
  if (!first || !last) return false;
  const rowWidth = last.x + last.width - first.x;
  if (rowWidth > pageWidth * WIDE_WORD_SPACING_MAX_LINE_WIDTH_RATIO) return false;

  const gaps: number[] = [];
  for (let index = 0; index < sorted.length; index++) {
    const span = sorted[index];
    const text = span.text.trim();
    const fontSize = span.fontSize || 12;
    if (text.length === 0 || text.length > WIDE_WORD_SPACING_MAX_TOKEN_CHARS || !LATIN_WORD_RE.test(text)) {
      return false;
    }
    if (span.width > Math.max(fontSize * text.length * WIDE_WORD_SPACING_MAX_TOKEN_WIDTH_RATIO, fontSize * 2.5)) {
      return false;
    }
    const prev = sorted[index - 1];
    if (prev) {
      const gap = span.x - (prev.x + prev.width);
      if (gap < 0 || gap > pageWidth * WIDE_WORD_SPACING_MAX_GAP_PAGE_RATIO) return false;
      gaps.push(gap);
    }
  }

  return gaps.some((gap) => gap > Math.max((first.fontSize || 12) * 1.5, 16));
}

function isSingleCjkGlyph(text: string): boolean {
  const chars = Array.from(text.trim());
  return chars.length === 1 && isCjkLeading(chars[0]);
}

export function isLikelyCjkDisplaySpacingRow(spans: readonly WordSpacingSpan[]): boolean {
  if (spans.length < 2 || spans.length > CJK_DISPLAY_SPACING_MAX_SPANS) return false;
  const sorted = [...spans].sort((a, b) => a.x - b.x);
  if (!sorted.every((span) => isSingleCjkGlyph(span.text))) return false;

  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const fontSize = cur.fontSize || prev.fontSize || 12;
    const gap = cur.x - (prev.x + prev.width);
    if (gap < fontSize * CJK_DISPLAY_SPACING_MIN_GAP_RATIO) return false;
    if (gap > fontSize * CJK_DISPLAY_SPACING_MAX_GAP_RATIO) return false;
    gaps.push(gap);
  }

  return gaps.length > 0;
}

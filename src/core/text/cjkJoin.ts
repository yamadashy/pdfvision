import { isRtlDominantPositionedText, isRtlDominantText, textOrder } from './textDirection.js';

/**
 * Stitch the per-item text stream returned by pdf.js `getTextContent`
 * into a single page-level string, with CJK-aware whitespace handling.
 *
 * Why this exists: pdf.js emits one text item per glyph for CJK PDFs
 * (positioned per-character so that 行 spacing is preserved), and
 * inserts a synthetic " " item between any two glyphs that are not
 * touching in the PDF's text matrix. For latin scripts that lines up
 * with real word boundaries; for CJK the same machinery produces
 * `人 人 生 而 自 由` even though the source reads `人人生而自由`.
 *
 * Heuristic: drop a whitespace-only item if it sits between two CJK
 * glyphs whose visual horizontal gap is below ~30 % of the surrounding
 * font size — that's tight enough to be a positioning artifact, not a
 * deliberate space. Latin-CJK boundaries (e.g. `2025 年`) and wide-gap
 * CJK pairs (column breaks) keep their space.
 */

/**
 * One item from pdf.js's `getTextContent`, narrowed to the fields we
 * need for join. Kept structural so unit tests can synthesize items
 * without pulling pdf.js in.
 */
export interface JoinItem {
  str: string;
  /** Top-left x of the glyph in PDF user-space points (from `transform[4]`). */
  x: number;
  /** Top-left y of the glyph in top-down page coordinates, when geometry is available. */
  y?: number;
  /** Glyph run width in points (from item.width, may be 0 on broken PDFs). */
  width: number;
  /** Glyph height in points — used as a fontSize proxy when fontSize is unknown. */
  fontSize: number;
  /** pdf.js's hard line-break marker between two items. */
  hasEOL: boolean;
  /** pdf.js text direction hint (`rtl` for Arabic/Hebrew-shaped runs). */
  dir?: string;
}

/**
 * Max gap (as a fraction of fontSize) between two CJK glyphs that we
 * still consider "touching". Used by both this module (to drop a pdf.js
 * synthetic whitespace item when its neighbours sit closer than this)
 * and by the layout assembler (to decide whether to *synthesize* a
 * space between two consecutive CJK glyph spans). Both surfaces ask
 * the same question — "is the visual gap a positioning artifact or a
 * real word boundary?" — so they must agree on a single threshold,
 * otherwise `pages[].text` and `pages[].layout.blocks[].text` would
 * disagree in the 0.3-1.0 band on the same document.
 * Empirically 0.3 catches the udhr-chinese case (real gap ≈ 0.28 ×
 * fontSize) while preserving column-break gaps (typically > 1.0 ×
 * fontSize).
 */
export const CJK_TIGHT_GAP_RATIO = 0.3;
const SYNTHETIC_LINE_BREAK_GAP_RATIO = 1.5;
const RTL_WORD_SPACE_MIN_GAP_RATIO = 0.12;
const LATIN_TIGHT_ARTIFACT_SPACE_RATIO = 0.12;
const LATIN_WORD_FRAGMENT_END_RE = /[\p{Script=Latin}\p{M}\p{N}]$/u;
const LATIN_WORD_FRAGMENT_START_RE = /^[\p{Script=Latin}\p{M}\p{N}]/u;

/**
 * Returns `true` if `s`'s first code point is in a CJK script we want
 * to apply the tight-join rule to. Covers Han (incl. extensions A and
 * Supplementary Plane B), Hiragana, Katakana, Hangul Syllables, and
 * Hangul Jamo. The check is on the first character — pdf.js typically
 * emits one CJK glyph per item, and even when it emits multiple the
 * leading character is enough to dispatch.
 */
export function isCjkLeading(s: string): boolean {
  const cp = s.codePointAt(0);
  if (cp === undefined) return false;
  return (
    // Hiragana + Katakana + small / phonetic extensions
    (cp >= 0x3040 && cp <= 0x30ff) ||
    // CJK Unified Ideographs + Extension A + compatibility forms
    (cp >= 0x3400 && cp <= 0x9fff) ||
    // Hangul Jamo + Compatibility Jamo
    (cp >= 0x1100 && cp <= 0x11ff) ||
    (cp >= 0x3130 && cp <= 0x318f) ||
    // Hangul Syllables
    (cp >= 0xac00 && cp <= 0xd7af) ||
    // Half-width Katakana (FF65-FF9F) in the broader half-width / full-width forms block
    (cp >= 0xff00 && cp <= 0xffef) ||
    // CJK Unified Ideographs Extension B (supplementary plane)
    (cp >= 0x20000 && cp <= 0x2a6df)
  );
}

/** Pure whitespace (str collapses to empty after trim) but non-empty. */
function isWhitespaceOnly(s: string): boolean {
  return s.length > 0 && s.trim().length === 0;
}

/**
 * Build the page-level text string from pdf.js items.
 *
 * - Hard line breaks (`hasEOL`) always emit `\n`.
 * - Whitespace-only items between two CJK glyphs, or tightly packed
 *   Latin word fragments, are dropped when the visual gap looks like a
 *   positioning artifact. Wide CJK column gaps, real Latin word spaces,
 *   and mixed-script boundaries keep their whitespace.
 */
export function joinPageText(items: readonly JoinItem[]): string {
  const parts: string[] = [];
  let line: JoinItem[] = [];
  const flushLine = () => {
    if (line.length > 0) {
      parts.push(joinLineItems(line));
      line = [];
    }
  };
  const trimTrailingWhitespace = () => {
    while (line.length > 0 && isWhitespaceOnly(line[line.length - 1].str)) line.pop();
  };
  const pushNewline = () => {
    if (parts.at(-1) !== '\n') parts.push('\n');
  };

  for (const item of items) {
    if (startsSyntheticVisualLine(line, item)) {
      trimTrailingWhitespace();
      flushLine();
      pushNewline();
    }

    if (item.hasEOL) {
      if (item.str.length > 0) line.push(item);
      flushLine();
      parts.push('\n');
    } else {
      line.push(item);
    }
  }
  flushLine();
  return parts.join('');
}

function startsSyntheticVisualLine(line: readonly JoinItem[], item: JoinItem): boolean {
  if (isWhitespaceOnly(item.str)) return false;
  const prev = [...line].reverse().find((candidate) => !isWhitespaceOnly(candidate.str));
  if (!prev || prev.y === undefined || item.y === undefined) return false;
  const fontSize = Math.max(prev.fontSize, item.fontSize, 1);
  return Math.abs(item.y - prev.y) > fontSize * SYNTHETIC_LINE_BREAK_GAP_RATIO;
}

function joinLineItems(items: readonly JoinItem[]): string {
  if (isRtlLine(items)) return joinRtlLineItems(items);
  return joinLtrLineItems(items);
}

function isRtlLine(items: readonly JoinItem[]): boolean {
  const textItems = items.filter((item) => item.str.trim().length > 0).map((item) => ({ text: item.str, x: item.x }));
  if (textItems.length === 0) return false;
  const rtlDir = items.filter((item) => item.str.trim().length > 0 && item.dir === 'rtl').length;
  return rtlDir > 0 && rtlDir >= textItems.length / 2 && isRtlDominantPositionedText(textItems);
}

function joinRtlLineItems(items: readonly JoinItem[]): string {
  const words = textOrder(
    items.filter((item) => item.str.trim().length > 0).map((item) => ({ ...item, text: item.str })),
  );
  if (words.length === 0) return '';

  let out = words[0].str;
  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1];
    const cur = words[i];
    const gap = prev.x - (cur.x + cur.width);
    const fontSize = cur.fontSize || prev.fontSize || 12;
    if (
      gap > fontSize * RTL_WORD_SPACE_MIN_GAP_RATIO &&
      isRtlDominantText(prev.str) &&
      isRtlDominantText(cur.str) &&
      !/\s$/.test(out) &&
      !/^\s/.test(cur.str)
    ) {
      out += ' ';
    }
    out += cur.str;
  }
  return out;
}

function joinLtrLineItems(items: readonly JoinItem[]): string {
  // Pre-compute, for each whitespace-only item, the previous and next
  // non-empty / non-whitespace neighbour. Walking the index once is
  // cheaper than the nested lookup the per-item decision would
  // otherwise need on long pages.
  // Typed-array form: one contiguous 32-bit-signed buffer per side,
  // initialised to -1 (the "no neighbour" sentinel). For long pages
  // this avoids the per-cell heap allocation a `number[]` would do.
  const prevNon = new Int32Array(items.length).fill(-1);
  const nextNon = new Int32Array(items.length).fill(-1);
  let lastNon = -1;
  for (let i = 0; i < items.length; i++) {
    prevNon[i] = lastNon;
    if (items[i].str.length > 0 && !isWhitespaceOnly(items[i].str)) lastNon = i;
  }
  lastNon = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    nextNon[i] = lastNon;
    if (items[i].str.length > 0 && !isWhitespaceOnly(items[i].str)) lastNon = i;
  }

  const parts: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const cur = items[i];

    if (cur.hasEOL) {
      // Hard line break wins — flush the item's text (in case the item
      // has both str and hasEOL), then the newline.
      if (cur.str.length > 0) parts.push(cur.str);
      parts.push('\n');
      continue;
    }

    if (isWhitespaceOnly(cur.str)) {
      const prev = prevNon[i] >= 0 ? items[prevNon[i]] : undefined;
      const next = nextNon[i] >= 0 ? items[nextNon[i]] : undefined;
      if (prev && next && isCjkLeading(prev.str) && isCjkLeading(next.str)) {
        // Take fontSize from whichever neighbour reports a positive one
        // (some PDFs leave items at fontSize 0; falling back keeps the
        // gap test stable). The gap is measured from the previous
        // glyph's right edge to the next glyph's left edge.
        const fontSize = next.fontSize || prev.fontSize;
        if (fontSize > 0) {
          const gap = next.x - (prev.x + prev.width);
          if (gap < fontSize * CJK_TIGHT_GAP_RATIO) {
            // Positioning artifact between two CJK glyphs — drop the
            // whitespace silently. Leave parts unchanged so the two
            // glyphs concatenate directly.
            continue;
          }
        }
      }
      if (prev && next && isTightLatinArtifactSpace(prev, next)) continue;
    }

    parts.push(cur.str);
  }
  return parts.join('');
}

function isTightLatinArtifactSpace(prev: JoinItem, next: JoinItem): boolean {
  const prevText = prev.str.trimEnd();
  const nextText = next.str.trimStart();
  if (!LATIN_WORD_FRAGMENT_END_RE.test(prevText) || !LATIN_WORD_FRAGMENT_START_RE.test(nextText)) return false;

  const fontSize = next.fontSize || prev.fontSize;
  if (fontSize <= 0) return false;

  const gap = next.x - (prev.x + prev.width);
  return gap <= fontSize * LATIN_TIGHT_ARTIFACT_SPACE_RATIO;
}

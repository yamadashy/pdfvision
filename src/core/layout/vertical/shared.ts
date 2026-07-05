import type { TextSpan } from '../../../types/index.js';
import { mode, round2 } from '../geometry.js';

export const FONT_SIZE_FALLBACK_PT = 12;

/** VERTICAL_SPAN_ASPECT_RATIO and VERTICAL_SPAN_MIN_FONT_MULTIPLIER
 *  were tuned against tall side labels and version annotations in sample
 *  PDFs. The ratio admits narrow vertical runs, while the font-size
 *  multiplier keeps short emphasis glyphs from being treated as vertical. */
const VERTICAL_SPAN_ASPECT_RATIO = 2;
const VERTICAL_SPAN_MIN_FONT_MULTIPLIER = 3;
const TALL_VERTICAL_CJK_MIN_CHARS = 2;
const TALL_VERTICAL_CJK_MIN_CHAR_HEIGHT_RATIO = 0.75;
const BODY_VERTICAL_CJK_X_TOLERANCE_RATIO = 0.16;
const BODY_VERTICAL_CJK_X_TOLERANCE_MIN_PT = 1;
const BODY_VERTICAL_CJK_X_TOLERANCE_MAX_PT = 2;
export const TATECHUYOKO_COLUMN_GAP_RATIO = 1.5;
export const TATECHUYOKO_COLUMN_OVERLAP_RATIO = 0.5;
export const BODY_VERTICAL_CJK_GLYPH_RE =
  /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3001-\u303f\u30a0\u30fb\u30fc\uff01-\uff65]$/u;
export const BODY_VERTICAL_LEADER_GLYPH_RE = /^(?:\u2026|\.\.\.)$/u;
export const CJK_SCRIPT_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export interface VerticalCjkRun {
  centerX: number;
  fontSize: number;
  spans: TextSpan[];
}

export interface VerticalCjkRunBlock {
  columns: VerticalCjkRun[];
}

export interface TallVerticalRun {
  columnX: number;
  fontSize: number;
  spans: TextSpan[];
  hasTatechuyoko: boolean;
}

export interface BodyVerticalCjkRunAnalysis {
  blocks: VerticalCjkRunBlock[];
  rubySpans: TextSpan[];
  gutterAnnotationSpans: TextSpan[];
  rubyAssociations: VerticalRubyAssociation[];
}

export interface VerticalRubyAssociation {
  ruby: VerticalCjkRun;
  baseColumn: VerticalCjkRun;
  baseSpans: TextSpan[];
  baseRanges: VerticalRubyBaseRange[];
  confidence: number;
}

export interface VerticalRubyBaseRange {
  span: TextSpan;
  start: number;
  end: number;
  y: number;
  height: number;
}

export function hasVerticalTextShape(span: TextSpan): boolean {
  const fontSize = span.fontSize || FONT_SIZE_FALLBACK_PT;
  return (
    span.height > span.width * VERTICAL_SPAN_ASPECT_RATIO && span.height > fontSize * VERTICAL_SPAN_MIN_FONT_MULTIPLIER
  );
}

export function centerX(span: TextSpan): number {
  return span.x + span.width / 2;
}

export function containsCjkScript(text: string): boolean {
  for (const char of text) {
    if (CJK_SCRIPT_RE.test(char)) return true;
  }
  return false;
}

function containsSufficientCjk(text: string): boolean {
  let count = 0;
  for (const char of text) {
    if (!CJK_SCRIPT_RE.test(char)) continue;
    count++;
    if (count >= TALL_VERTICAL_CJK_MIN_CHARS) return true;
  }
  return false;
}

export function isTallCjkVerticalSpan(span: TextSpan): boolean {
  const text = span.text.trim();
  if (!containsSufficientCjk(text)) return false;
  const charCount = [...text].length;
  if (charCount < TALL_VERTICAL_CJK_MIN_CHARS) return false;
  if (!hasVerticalTextShape(span)) return false;

  const fontSize = span.fontSize || FONT_SIZE_FALLBACK_PT;
  if (span.width > fontSize * 1.6) return false;
  return span.height >= fontSize * charCount * TALL_VERTICAL_CJK_MIN_CHAR_HEIGHT_RATIO;
}

export function bodyVerticalCjkXTolerance(span: TextSpan): number {
  const fontSize = span.fontSize || span.height || FONT_SIZE_FALLBACK_PT;
  return Math.min(
    Math.max(fontSize * BODY_VERTICAL_CJK_X_TOLERANCE_RATIO, BODY_VERTICAL_CJK_X_TOLERANCE_MIN_PT),
    BODY_VERTICAL_CJK_X_TOLERANCE_MAX_PT,
  );
}

export function toVerticalGlyphRun(run: TextSpan[], minRunSpans: number): VerticalCjkRun | undefined {
  if (run.length < minRunSpans) return undefined;
  const ySorted = [...run].sort((a, b) => a.y - b.y || a.x - b.x);
  const fontSize = round2(mode(ySorted.map((span) => span.fontSize || FONT_SIZE_FALLBACK_PT)));
  const center = ySorted.reduce((sum, span) => sum + centerX(span), 0) / ySorted.length;
  return {
    centerX: round2(center),
    fontSize,
    spans: ySorted,
  };
}

export function bodyRunTop(run: VerticalCjkRun): number {
  return Math.min(...run.spans.map((span) => span.y));
}

export function bodyRunBottom(run: VerticalCjkRun): number {
  return Math.max(...run.spans.map((span) => span.y + span.height));
}

export function runCenterY(run: VerticalCjkRun): number {
  return (bodyRunTop(run) + bodyRunBottom(run)) / 2;
}

export function toSingleSpanVerticalRun(span: TextSpan): VerticalCjkRun {
  return {
    centerX: round2(centerX(span)),
    fontSize: round2(span.fontSize || FONT_SIZE_FALLBACK_PT),
    spans: [span],
  };
}

export function isUniformVerticalBaseChar(char: string): boolean {
  return BODY_VERTICAL_CJK_GLYPH_RE.test(char) || BODY_VERTICAL_LEADER_GLYPH_RE.test(char);
}

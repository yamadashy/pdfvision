import type { LayoutBlock, LayoutLine, TextSpan } from '../../types/index.js';
import { isCjkLeading } from '../text/cjkJoin.js';
import { mode, round2, unionBox } from './geometry.js';

const FONT_SIZE_FALLBACK_PT = 12;
const VERTICAL_LINE_OVERLAP_RATIO = 0.35;

/** VERTICAL_SPAN_ASPECT_RATIO and VERTICAL_SPAN_MIN_FONT_MULTIPLIER
 *  were tuned against tall side labels and version annotations in sample
 *  PDFs. The ratio admits narrow vertical runs, while the font-size
 *  multiplier keeps short emphasis glyphs from being treated as vertical. */
const VERTICAL_SPAN_ASPECT_RATIO = 2;
const VERTICAL_SPAN_MIN_FONT_MULTIPLIER = 3;
/** Detect display-sized CJK vertical stacks conservatively. Body/table
 *  labels can align at the same x across rows, so small font sizes stay
 *  in the normal horizontal layout pass. The horizontal-neighbour cap
 *  keeps large vertical title columns from suppressing each other while
 *  still preserving ordinary CJK glyph rows. */
const VERTICAL_CJK_MAX_CHARS = 2;
const TALL_VERTICAL_CJK_MIN_CHARS = 2;
const VERTICAL_CJK_MIN_RUN_SPANS = 2;
const VERTICAL_CJK_MIN_FONT_SIZE_PT = 20;
const TALL_VERTICAL_CJK_MIN_CHAR_HEIGHT_RATIO = 0.75;
const VERTICAL_CJK_X_TOLERANCE_RATIO = 0.45;
const VERTICAL_CJK_X_TOLERANCE_MIN_PT = 4;
const VERTICAL_CJK_STEP_RATIO = 1.8;
const VERTICAL_CJK_HORIZONTAL_NEIGHBOUR_RATIO = 0.85;
const VERTICAL_CJK_HORIZONTAL_NEIGHBOUR_MAX_PT = 32;
const VERTICAL_CJK_MIN_HEIGHT_RATIO = 1.5;

/** Body-sized Japanese vertical text is emitted by pdf.js as one
 *  square-ish CJK glyph per span. Unlike the display-title path above,
 *  this cannot use a font-size gate. Instead it requires a long
 *  descending run at a stable x position; single-row table labels and
 *  multi-character horizontal spans cannot satisfy that signature. */
const BODY_VERTICAL_CJK_MIN_RUN_SPANS = 5;
const BODY_VERTICAL_CJK_X_TOLERANCE_RATIO = 0.16;
const BODY_VERTICAL_CJK_X_TOLERANCE_MIN_PT = 1;
const BODY_VERTICAL_CJK_X_TOLERANCE_MAX_PT = 2;
const BODY_VERTICAL_CJK_MIN_STEP_RATIO = 0.7;
const BODY_VERTICAL_CJK_MAX_STEP_RATIO = 1.8;
const BODY_VERTICAL_CJK_MAX_GLYPH_SIZE_RATIO = 1.8;
const BODY_VERTICAL_CJK_MAX_COLUMN_GAP_RATIO = 3;
const BODY_VERTICAL_CJK_MAX_COLUMN_GAP_PT = 36;
const BODY_VERTICAL_CJK_COLUMN_OVERLAP_RATIO = 0.05;
const RUBY_VERTICAL_CJK_MAX_FONT_RATIO = 0.6;
const RUBY_VERTICAL_CJK_MAX_BODY_GAP_RATIO = 1.2;
const RUBY_VERTICAL_CJK_MIN_Y_OVERLAP_RATIO = 0.5;
const RUBY_ASSOCIATION_MIN_BODY_OVERLAP_RATIO = 0.6;
const RUBY_ASSOCIATION_MIN_RUBY_OVERLAP_RATIO = 0.32;
const RUBY_ASSOCIATION_X_TIE_RATIO = 1;
const RUBY_ASSOCIATION_MIN_CONFIDENCE = 0.45;
const RUBY_ASSOCIATION_MIN_MULTI_BASE_HEIGHT_RATIO = 0.5;
const RUBY_VERTICAL_CJK_MAX_CHARS = 12;
const RUBY_VERTICAL_CJK_MAX_WIDTH_RATIO = 1.8;
const RUBY_VERTICAL_CJK_MIN_HEIGHT_RATIO = 0.55;
const RUBY_VERTICAL_CJK_MAX_HEIGHT_RATIO = 1.6;
const SHORT_BODY_VERTICAL_CJK_MIN_RUN_SPANS = 3;
const SHORT_BODY_VERTICAL_CJK_MIN_FONT_RATIO = 0.75;
const SHORT_BODY_VERTICAL_CJK_MAX_FONT_RATIO = 1.25;
const TATECHUYOKO_MAX_CHARS = 4;
const TATECHUYOKO_MAX_WIDTH_RATIO = 2.2;
const TATECHUYOKO_MAX_HEIGHT_RATIO = 1.5;
const TATECHUYOKO_COLUMN_GAP_RATIO = 1.5;
const TATECHUYOKO_COLUMN_OVERLAP_RATIO = 0.5;
const SHORT_VERTICAL_CJK_MAX_CHARS = 4;
const SHORT_VERTICAL_CJK_MAX_WIDTH_RATIO = 1.6;
const SHORT_VERTICAL_CJK_MIN_HEIGHT_RATIO = 0.7;
const SHORT_VERTICAL_CJK_MAX_HEIGHT_RATIO = 1.35;
const BODY_VERTICAL_CJK_GLYPH_RE =
  /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3001-\u303f\u30a0\u30fb\u30fc\uff01-\uff65]$/u;
const BODY_VERTICAL_LEADER_GLYPH_RE = /^(?:\u2026|\.\.\.)$/u;
const CJK_SCRIPT_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const TATECHUYOKO_FRAGMENT_RE = /^[0-9０-９()（）]+$/u;

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

function centerX(span: TextSpan): number {
  return span.x + span.width / 2;
}

function verticalCjkXTolerance(span: TextSpan): number {
  const fontSize = span.fontSize || span.height || FONT_SIZE_FALLBACK_PT;
  return Math.max(fontSize * VERTICAL_CJK_X_TOLERANCE_RATIO, VERTICAL_CJK_X_TOLERANCE_MIN_PT);
}

function isCompactCjkGlyph(span: TextSpan): boolean {
  const text = span.text.trim();
  if (!isCjkLeading(text)) return false;
  const charCount = [...text].length;
  if (charCount === 0 || charCount > VERTICAL_CJK_MAX_CHARS) return false;

  const fontSize = span.fontSize || span.height || FONT_SIZE_FALLBACK_PT;
  if (fontSize < VERTICAL_CJK_MIN_FONT_SIZE_PT) return false;
  return span.width <= fontSize * 1.6 && span.height <= fontSize * 1.8;
}

function isTallCjkVerticalSpan(span: TextSpan): boolean {
  const text = span.text.trim();
  if (!containsSufficientCjk(text)) return false;
  const charCount = [...text].length;
  if (charCount < TALL_VERTICAL_CJK_MIN_CHARS) return false;
  if (!hasVerticalTextShape(span)) return false;

  const fontSize = span.fontSize || FONT_SIZE_FALLBACK_PT;
  if (span.width > fontSize * 1.6) return false;
  return span.height >= fontSize * charCount * TALL_VERTICAL_CJK_MIN_CHAR_HEIGHT_RATIO;
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

function isTatechuyokoFragment(span: TextSpan): boolean {
  const text = span.text.trim();
  const charCount = [...text].length;
  if (charCount === 0 || charCount > TATECHUYOKO_MAX_CHARS) return false;
  if (!TATECHUYOKO_FRAGMENT_RE.test(text)) return false;

  const fontSize = span.fontSize || span.height || FONT_SIZE_FALLBACK_PT;
  return span.width <= fontSize * TATECHUYOKO_MAX_WIDTH_RATIO && span.height <= fontSize * TATECHUYOKO_MAX_HEIGHT_RATIO;
}

function isShortVerticalCjkFragment(span: TextSpan): boolean {
  const text = span.text.trim();
  const charCount = [...text].length;
  if (charCount === 0 || charCount > SHORT_VERTICAL_CJK_MAX_CHARS) return false;
  if (!containsCjkScript(text)) return false;

  const fontSize = span.fontSize || span.height || FONT_SIZE_FALLBACK_PT;
  return (
    span.width <= fontSize * SHORT_VERTICAL_CJK_MAX_WIDTH_RATIO &&
    span.height >= fontSize * charCount * SHORT_VERTICAL_CJK_MIN_HEIGHT_RATIO &&
    span.height <= fontSize * charCount * SHORT_VERTICAL_CJK_MAX_HEIGHT_RATIO
  );
}

function containsCjkScript(text: string): boolean {
  for (const char of text) {
    if (CJK_SCRIPT_RE.test(char)) return true;
  }
  return false;
}

function tallColumnAxis(span: TextSpan): number {
  return isTatechuyokoFragment(span) ? centerX(span) : span.x;
}

function sameTallColumn(a: TextSpan, b: TextSpan): boolean {
  return (
    Math.abs(tallColumnAxis(a) - tallColumnAxis(b)) <= Math.max(verticalCjkXTolerance(a), verticalCjkXTolerance(b))
  );
}

function canContinueTallVerticalRun(prev: TextSpan, cur: TextSpan): boolean {
  if (!sameTallColumn(prev, cur)) return false;
  const fontSize = Math.max(prev.fontSize || FONT_SIZE_FALLBACK_PT, cur.fontSize || FONT_SIZE_FALLBACK_PT);
  const gap = cur.y - (prev.y + prev.height);
  return gap >= -fontSize * TATECHUYOKO_COLUMN_OVERLAP_RATIO && gap <= fontSize * TATECHUYOKO_COLUMN_GAP_RATIO;
}

function isTallRunMember(
  span: TextSpan,
  tallSpans: ReadonlySet<TextSpan>,
  tatechuyokoFragments: ReadonlySet<TextSpan>,
  shortCjkFragments: ReadonlySet<TextSpan>,
): boolean {
  return tallSpans.has(span) || tatechuyokoFragments.has(span) || shortCjkFragments.has(span);
}

function collectTallRunSequence(
  spans: readonly TextSpan[],
  anchorIndex: number,
  tallSpans: ReadonlySet<TextSpan>,
  tatechuyokoFragments: ReadonlySet<TextSpan>,
  shortCjkFragments: ReadonlySet<TextSpan>,
  consumed: ReadonlySet<TextSpan>,
): TextSpan[] {
  let start = anchorIndex;
  let end = anchorIndex;

  while (start > 0) {
    const prev = spans[start - 1];
    const cur = spans[start];
    if (consumed.has(prev) || !isTallRunMember(prev, tallSpans, tatechuyokoFragments, shortCjkFragments)) break;
    if (!canContinueTallVerticalRun(prev, cur)) break;
    start--;
  }

  while (end + 1 < spans.length) {
    const cur = spans[end];
    const next = spans[end + 1];
    if (consumed.has(next) || !isTallRunMember(next, tallSpans, tatechuyokoFragments, shortCjkFragments)) break;
    if (!canContinueTallVerticalRun(cur, next)) break;
    end++;
  }

  return spans.slice(start, end + 1);
}

function toTallVerticalRun(spans: TextSpan[], hasTatechuyoko: boolean): TallVerticalRun {
  const ySorted = [...spans].sort((a, b) => a.y - b.y || a.x - b.x);
  const columnX = ySorted.reduce((sum, span) => sum + tallColumnAxis(span), 0) / ySorted.length;
  return {
    columnX: round2(columnX),
    fontSize: round2(mode(ySorted.map((span) => span.fontSize || FONT_SIZE_FALLBACK_PT))),
    spans: ySorted,
    hasTatechuyoko,
  };
}

export function extractTallVerticalRuns(spans: readonly TextSpan[]): TallVerticalRun[] {
  const tallSpans = new Set(spans.filter(isTallCjkVerticalSpan));
  if (tallSpans.size === 0) return [];

  const tatechuyokoFragments = new Set(spans.filter((span) => !tallSpans.has(span) && isTatechuyokoFragment(span)));
  const shortCjkFragments = new Set(spans.filter((span) => !tallSpans.has(span) && isShortVerticalCjkFragment(span)));
  const consumed = new Set<TextSpan>();
  const runs: TallVerticalRun[] = [];

  for (let index = 0; index < spans.length; index++) {
    const span = spans[index];
    if (!tallSpans.has(span) || consumed.has(span)) continue;

    const sequence = collectTallRunSequence(spans, index, tallSpans, tatechuyokoFragments, shortCjkFragments, consumed);
    const hasTatechuyoko = sequence.some((candidate) => tatechuyokoFragments.has(candidate));
    const runSpans = sequence.length > 1 && hasTatechuyoko ? sequence : [span];
    for (const runSpan of runSpans) consumed.add(runSpan);
    runs.push(toTallVerticalRun(runSpans, hasTatechuyoko));
  }

  return runs;
}

function hasCloseHorizontalNeighbour(span: TextSpan, spans: readonly TextSpan[]): boolean {
  const fontSize = span.fontSize || span.height || FONT_SIZE_FALLBACK_PT;
  const maxGap = Math.min(fontSize * VERTICAL_CJK_HORIZONTAL_NEIGHBOUR_RATIO, VERTICAL_CJK_HORIZONTAL_NEIGHBOUR_MAX_PT);
  for (const other of spans) {
    if (other === span || other.text.trim().length === 0) continue;
    const minHeight = Math.max(Math.min(span.height, other.height), 1);
    const overlap = Math.min(span.y + span.height, other.y + other.height) - Math.max(span.y, other.y);
    if (overlap < minHeight * VERTICAL_LINE_OVERLAP_RATIO) continue;

    const rightGap = other.x - (span.x + span.width);
    const leftGap = span.x - (other.x + other.width);
    if ((rightGap >= 0 && rightGap <= maxGap) || (leftGap >= 0 && leftGap <= maxGap)) return true;
  }
  return false;
}

function canContinueVerticalCjkRun(prev: TextSpan, cur: TextSpan): boolean {
  const fontSize = Math.max(prev.fontSize || prev.height || FONT_SIZE_FALLBACK_PT, cur.fontSize || cur.height || 0);
  if (Math.abs(centerX(cur) - centerX(prev)) > Math.max(verticalCjkXTolerance(prev), verticalCjkXTolerance(cur))) {
    return false;
  }
  const step = cur.y - prev.y;
  return step > 0 && step <= fontSize * VERTICAL_CJK_STEP_RATIO;
}

function bodyVerticalCjkXTolerance(span: TextSpan): number {
  const fontSize = span.fontSize || span.height || FONT_SIZE_FALLBACK_PT;
  return Math.min(
    Math.max(fontSize * BODY_VERTICAL_CJK_X_TOLERANCE_RATIO, BODY_VERTICAL_CJK_X_TOLERANCE_MIN_PT),
    BODY_VERTICAL_CJK_X_TOLERANCE_MAX_PT,
  );
}

function isBodyVerticalCjkGlyph(span: TextSpan): boolean {
  const text = span.text.trim();
  if (!BODY_VERTICAL_CJK_GLYPH_RE.test(text)) return false;
  if ([...text].length !== 1) return false;

  return hasBodyVerticalGlyphBox(span);
}

function isShortBodyVerticalCjkGlyph(span: TextSpan): boolean {
  if (isBodyVerticalCjkGlyph(span)) return true;
  const text = span.text.trim();
  if (!BODY_VERTICAL_LEADER_GLYPH_RE.test(text)) return false;
  return hasBodyVerticalGlyphBox(span);
}

function hasBodyVerticalGlyphBox(span: TextSpan): boolean {
  const fontSize = span.fontSize || span.height || FONT_SIZE_FALLBACK_PT;
  return (
    span.width <= fontSize * BODY_VERTICAL_CJK_MAX_GLYPH_SIZE_RATIO &&
    span.height <= fontSize * BODY_VERTICAL_CJK_MAX_GLYPH_SIZE_RATIO
  );
}

function canContinueBodyVerticalCjkRun(prev: TextSpan, cur: TextSpan): boolean {
  const fontSize = Math.max(prev.fontSize || prev.height || FONT_SIZE_FALLBACK_PT, cur.fontSize || cur.height || 0);
  if (
    Math.abs(centerX(cur) - centerX(prev)) > Math.max(bodyVerticalCjkXTolerance(prev), bodyVerticalCjkXTolerance(cur))
  ) {
    return false;
  }
  const step = cur.y - prev.y;
  return step >= fontSize * BODY_VERTICAL_CJK_MIN_STEP_RATIO && step <= fontSize * BODY_VERTICAL_CJK_MAX_STEP_RATIO;
}

function toVerticalGlyphRun(run: TextSpan[], minRunSpans: number): VerticalCjkRun | undefined {
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

function bodyRunTop(run: VerticalCjkRun): number {
  return Math.min(...run.spans.map((span) => span.y));
}

function bodyRunBottom(run: VerticalCjkRun): number {
  return Math.max(...run.spans.map((span) => span.y + span.height));
}

function runCenterY(run: VerticalCjkRun): number {
  return (bodyRunTop(run) + bodyRunBottom(run)) / 2;
}

function canContinueBodyVerticalBlock(prev: VerticalCjkRun, cur: VerticalCjkRun): boolean {
  const gap = prev.centerX - cur.centerX;
  if (gap < 0) return false;
  const fontSize = Math.max(prev.fontSize, cur.fontSize, FONT_SIZE_FALLBACK_PT);
  if (gap > Math.max(fontSize * BODY_VERTICAL_CJK_MAX_COLUMN_GAP_RATIO, BODY_VERTICAL_CJK_MAX_COLUMN_GAP_PT)) {
    return false;
  }

  const overlap = Math.min(bodyRunBottom(prev), bodyRunBottom(cur)) - Math.max(bodyRunTop(prev), bodyRunTop(cur));
  if (overlap <= 0) return false;
  const minHeight = Math.max(Math.min(bodyRunBottom(prev) - bodyRunTop(prev), bodyRunBottom(cur) - bodyRunTop(cur)), 1);
  return overlap / minHeight >= BODY_VERTICAL_CJK_COLUMN_OVERLAP_RATIO;
}

function collectBodyVerticalCjkRuns(spans: readonly TextSpan[], minRunSpans: number): VerticalCjkRun[] {
  const candidates = spans.filter(isBodyVerticalCjkGlyph).sort((a, b) => centerX(b) - centerX(a) || a.y - b.y);
  if (candidates.length < minRunSpans) return [];

  const columns: TextSpan[][] = [];
  for (const candidate of candidates) {
    const x = centerX(candidate);
    const column = columns.find((item) => {
      const anchor = item[0];
      return (
        Math.abs(x - centerX(anchor)) <=
        Math.max(bodyVerticalCjkXTolerance(candidate), bodyVerticalCjkXTolerance(anchor))
      );
    });
    if (column) {
      column.push(candidate);
    } else {
      columns.push([candidate]);
    }
  }

  const runs: VerticalCjkRun[] = [];
  for (const column of columns) {
    const sortedColumn = [...column].sort((a, b) => a.y - b.y || a.x - b.x);
    let run: TextSpan[] = [];
    const flush = () => {
      const verticalRun = toVerticalGlyphRun(run, minRunSpans);
      if (verticalRun) runs.push(verticalRun);
      run = [];
    };
    for (const span of sortedColumn) {
      const prev = run.at(-1);
      if (!prev || canContinueBodyVerticalCjkRun(prev, span)) {
        run.push(span);
      } else {
        flush();
        run.push(span);
      }
    }
    flush();
  }

  return runs;
}

function collectTallBodyVerticalCjkRuns(spans: readonly TextSpan[]): {
  associationRuns: VerticalCjkRun[];
  rubyAnchorRuns: VerticalCjkRun[];
} {
  const tallSpans = spans.filter(isTallBodyVerticalCjkSpan);
  const contextualGlyphs = spans.filter(
    (span) => !tallSpans.includes(span) && isBodyVerticalCjkGlyph(span) && hasTallBodySpanNeighbour(span, tallSpans),
  );
  const candidates = [...tallSpans, ...contextualGlyphs].sort((a, b) => centerX(b) - centerX(a) || a.y - b.y);
  if (candidates.length === 0) return { associationRuns: [], rubyAnchorRuns: [] };

  const columns: TextSpan[][] = [];
  for (const candidate of candidates) {
    const x = centerX(candidate);
    const column = columns.find((item) => {
      const anchor = item[0];
      return (
        Math.abs(x - centerX(anchor)) <=
        Math.max(bodyVerticalCjkXTolerance(candidate), bodyVerticalCjkXTolerance(anchor))
      );
    });
    if (column) {
      column.push(candidate);
    } else {
      columns.push([candidate]);
    }
  }

  const associationRuns: VerticalCjkRun[] = [];
  const rubyAnchorRuns: VerticalCjkRun[] = [];
  for (const column of columns) {
    const sortedColumn = [...column].sort((a, b) => a.y - b.y || a.x - b.x);
    let run: TextSpan[] = [];
    const flush = () => {
      if (run.length === 0) return;
      const verticalRun = toTallBodyVerticalRun(run);
      rubyAnchorRuns.push(verticalRun);
      if (run.every(isAssociableTallBodyRunSpan)) associationRuns.push(verticalRun);
      run = [];
    };
    for (const span of sortedColumn) {
      const prev = run.at(-1);
      if (!prev || canContinueTallBodyVerticalRun(prev, span)) {
        run.push(span);
      } else {
        flush();
        run.push(span);
      }
    }
    flush();
  }
  return { associationRuns, rubyAnchorRuns };
}

function hasTallBodySpanNeighbour(span: TextSpan, tallSpans: readonly TextSpan[]): boolean {
  for (const tall of tallSpans) {
    if (
      Math.abs(centerX(span) - centerX(tall)) >
      Math.max(bodyVerticalCjkXTolerance(span), bodyVerticalCjkXTolerance(tall))
    ) {
      continue;
    }
    const fontSize = Math.max(span.fontSize || FONT_SIZE_FALLBACK_PT, tall.fontSize || FONT_SIZE_FALLBACK_PT);
    const gap = Math.max(span.y - (tall.y + tall.height), tall.y - (span.y + span.height), 0);
    if (gap <= fontSize * TATECHUYOKO_COLUMN_GAP_RATIO) return true;
  }
  return false;
}

function isTallBodyVerticalCjkSpan(span: TextSpan): boolean {
  const chars = Array.from(span.text);
  if (chars.length < BODY_VERTICAL_CJK_MIN_RUN_SPANS) return false;
  if (!isTallCjkVerticalSpan(span)) return false;

  const fontSize = span.fontSize || FONT_SIZE_FALLBACK_PT;
  const pitch = span.height / Math.max(chars.length, 1);
  return pitch >= fontSize * BODY_VERTICAL_CJK_MIN_STEP_RATIO && pitch <= fontSize * BODY_VERTICAL_CJK_MAX_STEP_RATIO;
}

function isUniformTallVerticalBaseSpan(span: TextSpan): boolean {
  return Array.from(span.text).every(isUniformVerticalBaseChar);
}

function isAssociableTallBodyRunSpan(span: TextSpan): boolean {
  return isBodyVerticalCjkGlyph(span) || isUniformTallVerticalBaseSpan(span);
}

function isUniformVerticalBaseChar(char: string): boolean {
  return BODY_VERTICAL_CJK_GLYPH_RE.test(char) || BODY_VERTICAL_LEADER_GLYPH_RE.test(char);
}

function canContinueTallBodyVerticalRun(prev: TextSpan, cur: TextSpan): boolean {
  if (
    Math.abs(centerX(cur) - centerX(prev)) > Math.max(bodyVerticalCjkXTolerance(prev), bodyVerticalCjkXTolerance(cur))
  ) {
    return false;
  }
  const fontSize = Math.max(prev.fontSize || FONT_SIZE_FALLBACK_PT, cur.fontSize || FONT_SIZE_FALLBACK_PT);
  const gap = cur.y - (prev.y + prev.height);
  return gap >= -fontSize * TATECHUYOKO_COLUMN_OVERLAP_RATIO && gap <= fontSize * TATECHUYOKO_COLUMN_GAP_RATIO;
}

function toTallBodyVerticalRun(spans: readonly TextSpan[]): VerticalCjkRun {
  const ySorted = [...spans].sort((a, b) => a.y - b.y || a.x - b.x);
  const fontSize = round2(mode(ySorted.map((span) => span.fontSize || FONT_SIZE_FALLBACK_PT)));
  const center = ySorted.reduce((sum, span) => sum + centerX(span), 0) / ySorted.length;
  return {
    centerX: round2(center),
    fontSize,
    spans: ySorted,
  };
}

function toSingleSpanVerticalRun(span: TextSpan): VerticalCjkRun {
  return {
    centerX: round2(centerX(span)),
    fontSize: round2(span.fontSize || FONT_SIZE_FALLBACK_PT),
    spans: [span],
  };
}

function collectShortBodyVerticalCjkRuns(
  spans: readonly TextSpan[],
  bodyRuns: readonly VerticalCjkRun[],
  excludedSpans: ReadonlySet<TextSpan>,
): VerticalCjkRun[] {
  if (bodyRuns.length === 0) return [];

  const bodySpanSet = new Set<TextSpan>();
  for (const run of bodyRuns) {
    for (const span of run.spans) bodySpanSet.add(span);
  }

  const candidates = spans
    .filter((span) => !bodySpanSet.has(span) && !excludedSpans.has(span))
    .filter(isShortBodyVerticalCjkGlyph)
    .sort((a, b) => centerX(b) - centerX(a) || a.y - b.y);
  if (candidates.length < SHORT_BODY_VERTICAL_CJK_MIN_RUN_SPANS) return [];

  const columns: TextSpan[][] = [];
  for (const candidate of candidates) {
    const x = centerX(candidate);
    const column = columns.find((item) => {
      const anchor = item[0];
      return (
        Math.abs(x - centerX(anchor)) <=
        Math.max(bodyVerticalCjkXTolerance(candidate), bodyVerticalCjkXTolerance(anchor))
      );
    });
    if (column) {
      column.push(candidate);
    } else {
      columns.push([candidate]);
    }
  }

  const runs: VerticalCjkRun[] = [];
  for (const column of columns) {
    const sortedColumn = [...column].sort((a, b) => a.y - b.y || a.x - b.x);
    let run: TextSpan[] = [];
    const flush = () => {
      const verticalRun = toVerticalGlyphRun(run, SHORT_BODY_VERTICAL_CJK_MIN_RUN_SPANS);
      if (verticalRun && isContextualShortBodyVerticalRun(verticalRun, bodyRuns)) runs.push(verticalRun);
      run = [];
    };
    for (const span of sortedColumn) {
      const prev = run.at(-1);
      if (!prev || canContinueBodyVerticalCjkRun(prev, span)) {
        run.push(span);
      } else {
        flush();
        run.push(span);
      }
    }
    flush();
  }

  return runs;
}

function isContextualShortBodyVerticalRun(candidate: VerticalCjkRun, bodyRuns: readonly VerticalCjkRun[]): boolean {
  if (!candidate.spans.some((span) => containsCjkScript(span.text))) return false;

  for (const body of bodyRuns) {
    if (!hasCompatibleBodyFontSize(candidate, body)) continue;
    if (canContinueBodyVerticalBlock(body, candidate) || canContinueBodyVerticalBlock(candidate, body)) return true;
  }
  return false;
}

function hasCompatibleBodyFontSize(candidate: VerticalCjkRun, body: VerticalCjkRun): boolean {
  const ratio = candidate.fontSize / Math.max(body.fontSize, 0.001);
  return ratio >= SHORT_BODY_VERTICAL_CJK_MIN_FONT_RATIO && ratio <= SHORT_BODY_VERTICAL_CJK_MAX_FONT_RATIO;
}

function collectRubyVerticalCjkRuns(
  spans: readonly TextSpan[],
  bodyAnchorRuns: readonly VerticalCjkRun[],
): VerticalCjkRun[] {
  const candidates = spans.filter(isRubyVerticalCjkSpanCandidate).sort((a, b) => centerX(b) - centerX(a) || a.y - b.y);
  if (candidates.length === 0) return [];

  const columns: TextSpan[][] = [];
  for (const candidate of candidates) {
    const x = centerX(candidate);
    const column = columns.find((item) => {
      const anchor = item[0];
      return (
        Math.abs(x - centerX(anchor)) <=
        Math.max(bodyVerticalCjkXTolerance(candidate), bodyVerticalCjkXTolerance(anchor))
      );
    });
    if (column) {
      column.push(candidate);
    } else {
      columns.push([candidate]);
    }
  }

  const runs: VerticalCjkRun[] = [];
  for (const column of columns) {
    const sortedColumn = [...column].sort((a, b) => a.y - b.y || a.x - b.x);
    let run: TextSpan[] = [];
    const flush = () => {
      const verticalRun = toVerticalGlyphRun(run, 1);
      if (verticalRun && isRubyVerticalRun(verticalRun, bodyAnchorRuns)) runs.push(verticalRun);
      run = [];
    };
    for (const span of sortedColumn) {
      const prev = run.at(-1);
      if (!prev || canContinueRubyVerticalCjkRun(prev, span)) {
        run.push(span);
      } else {
        flush();
        run.push(span);
      }
    }
    flush();
  }

  return runs;
}

function isRubyVerticalCjkSpanCandidate(span: TextSpan): boolean {
  const text = span.text.trim();
  const chars = Array.from(text);
  if (chars.length === 0 || chars.length > RUBY_VERTICAL_CJK_MAX_CHARS) return false;
  if (!chars.some((char) => CJK_SCRIPT_RE.test(char))) return false;
  if (!chars.every(isUniformVerticalBaseChar)) return false;

  const fontSize = span.fontSize || span.height || FONT_SIZE_FALLBACK_PT;
  return (
    span.width <= fontSize * RUBY_VERTICAL_CJK_MAX_WIDTH_RATIO &&
    span.height >= fontSize * chars.length * RUBY_VERTICAL_CJK_MIN_HEIGHT_RATIO &&
    span.height <= fontSize * chars.length * RUBY_VERTICAL_CJK_MAX_HEIGHT_RATIO
  );
}

function canContinueRubyVerticalCjkRun(prev: TextSpan, cur: TextSpan): boolean {
  if (
    Math.abs(centerX(cur) - centerX(prev)) > Math.max(bodyVerticalCjkXTolerance(prev), bodyVerticalCjkXTolerance(cur))
  ) {
    return false;
  }
  const fontSize = Math.max(prev.fontSize || prev.height || FONT_SIZE_FALLBACK_PT, cur.fontSize || cur.height || 0);
  const gap = cur.y - (prev.y + prev.height);
  return gap >= -fontSize * TATECHUYOKO_COLUMN_OVERLAP_RATIO && gap <= fontSize * TATECHUYOKO_COLUMN_GAP_RATIO;
}

function groupBodyVerticalRunsIntoBlocks(runs: readonly VerticalCjkRun[]): VerticalCjkRunBlock[] {
  const sortedRuns = [...runs].sort((a, b) => b.centerX - a.centerX || bodyRunTop(a) - bodyRunTop(b));
  const blocks: VerticalCjkRunBlock[] = [];
  let columnsInBlock: VerticalCjkRun[] = [];
  const flushBlock = () => {
    if (columnsInBlock.length > 0) blocks.push({ columns: columnsInBlock });
    columnsInBlock = [];
  };

  for (const run of sortedRuns) {
    const previous = columnsInBlock.at(-1);
    if (previous && !canContinueBodyVerticalBlock(previous, run)) flushBlock();
    columnsInBlock.push(run);
  }
  flushBlock();

  return blocks;
}

function isRubyVerticalRun(candidate: VerticalCjkRun, bodyRuns: readonly VerticalCjkRun[]): boolean {
  for (const body of bodyRuns) {
    if (candidate === body) continue;
    if (candidate.fontSize > body.fontSize * RUBY_VERTICAL_CJK_MAX_FONT_RATIO) continue;

    const gap = candidate.centerX - body.centerX;
    if (gap <= 0 || gap > body.fontSize * RUBY_VERTICAL_CJK_MAX_BODY_GAP_RATIO) continue;

    const overlap =
      Math.min(bodyRunBottom(candidate), bodyRunBottom(body)) - Math.max(bodyRunTop(candidate), bodyRunTop(body));
    if (overlap <= 0) continue;

    const candidateHeight = Math.max(bodyRunBottom(candidate) - bodyRunTop(candidate), 1);
    if (overlap / candidateHeight >= RUBY_VERTICAL_CJK_MIN_Y_OVERLAP_RATIO) return true;
  }
  return false;
}

export function extractBodyVerticalCjkRunAnalysis(spans: readonly TextSpan[]): BodyVerticalCjkRunAnalysis {
  const bodyRuns = collectBodyVerticalCjkRuns(spans, BODY_VERTICAL_CJK_MIN_RUN_SPANS);
  const tallBodyRuns = collectTallBodyVerticalCjkRuns(spans);
  const bodyAnchorRuns = [...bodyRuns, ...tallBodyRuns.rubyAnchorRuns];
  if (bodyAnchorRuns.length === 0) return { blocks: [], rubySpans: [], rubyAssociations: [] };

  const rubyRuns = [
    ...collectBodyVerticalCjkRuns(spans, 1).filter((run) => isRubyVerticalRun(run, bodyRuns)),
    ...collectRubyVerticalCjkRuns(spans, tallBodyRuns.rubyAnchorRuns),
  ];
  const rubySpanSet = new Set<TextSpan>();
  const rubySpans: TextSpan[] = [];
  for (const run of rubyRuns) {
    if (run.spans.some((span) => rubySpanSet.has(span))) continue;
    for (const span of run.spans) {
      rubySpanSet.add(span);
      rubySpans.push(span);
    }
  }

  const nonRubyBodyRuns = bodyRuns.filter((run) => !run.spans.some((span) => rubySpanSet.has(span)));
  const tallBodyRunsWithRubyContext = tallBodyRuns.associationRuns.filter((run) =>
    rubyRuns.some((ruby) => isRubyAdjacentToBodyColumn(ruby, run)),
  );
  const shortBodyRuns = collectShortBodyVerticalCjkRuns(spans, nonRubyBodyRuns, rubySpanSet);
  const bodyColumns = [...nonRubyBodyRuns, ...tallBodyRunsWithRubyContext, ...shortBodyRuns];

  return {
    blocks: groupBodyVerticalRunsIntoBlocks(bodyColumns),
    rubySpans: rubySpans.sort((a, b) => centerX(b) - centerX(a) || a.y - b.y),
    rubyAssociations: associateRubyRuns(rubyRuns, bodyColumns),
  };
}

export function extractBodyVerticalCjkRunBlocks(spans: readonly TextSpan[]): VerticalCjkRunBlock[] {
  return extractBodyVerticalCjkRunAnalysis(spans).blocks;
}

function toVerticalBlock(run: TextSpan[]): LayoutBlock | undefined {
  if (run.length < VERTICAL_CJK_MIN_RUN_SPANS) return undefined;
  const ySorted = [...run].sort((a, b) => a.y - b.y || a.x - b.x);
  const box = unionBox(ySorted);
  const fontSize = round2(mode(ySorted.map((s) => s.fontSize)));
  if (box.height < Math.max(box.width * VERTICAL_CJK_MIN_HEIGHT_RATIO, fontSize * VERTICAL_CJK_MIN_RUN_SPANS)) {
    return undefined;
  }

  const line: LayoutLine = {
    text: ySorted.map((span) => span.text).join(''),
    ...box,
    fontSize,
    writingMode: 'vertical',
  };
  return {
    text: line.text,
    ...box,
    lines: [line],
    writingMode: 'vertical',
  };
}

function toBodyVerticalBlock(
  block: VerticalCjkRunBlock,
  rubyAssociations: readonly VerticalRubyAssociation[] = [],
): LayoutBlock {
  const columns = [...block.columns].sort((a, b) => b.centerX - a.centerX || bodyRunTop(a) - bodyRunTop(b));
  const lines: LayoutLine[] = columns.map((column) => {
    const box = unionBox(column.spans);
    return {
      text: verticalRunTextWithRuby(column, rubyAssociations),
      ...box,
      fontSize: column.fontSize,
      writingMode: 'vertical',
    };
  });
  const box = unionBox(lines);
  return {
    text: lines.map((line) => line.text).join('\n'),
    ...box,
    lines,
    writingMode: 'vertical',
  };
}

function toTallVerticalBlock(run: TallVerticalRun): LayoutBlock {
  const box = unionBox(run.spans);
  const fontSize = round2(run.fontSize || FONT_SIZE_FALLBACK_PT);
  const line: LayoutLine = {
    text: run.spans.map((span) => span.text.trim()).join(''),
    ...box,
    fontSize,
    writingMode: 'vertical',
  };
  return {
    text: line.text,
    ...box,
    lines: [line],
    writingMode: 'vertical',
  };
}

export function extractVerticalCjkBlocks(spans: readonly TextSpan[]): {
  blocks: LayoutBlock[];
  remainingSpans: TextSpan[];
} {
  const used = new Set<TextSpan>();
  const blocks: LayoutBlock[] = [];

  const initialBodyVertical = extractBodyVerticalCjkRunAnalysis(spans);
  const tallBodyRubyBlocks = initialBodyVertical.blocks.filter((block) =>
    block.columns.some((column) => column.spans.some(isTallBodyVerticalCjkSpan)),
  );
  const tallBodyRubyColumns = new Set(tallBodyRubyBlocks.flatMap((block) => block.columns));
  for (const block of tallBodyRubyBlocks) {
    blocks.push(toBodyVerticalBlock(block, initialBodyVertical.rubyAssociations));
    for (const column of block.columns) {
      for (const span of column.spans) used.add(span);
    }
  }
  const tallRubyAnchors = collectTallBodyVerticalCjkRuns(spans).rubyAnchorRuns;
  for (const span of initialBodyVertical.rubySpans) {
    const ruby = toSingleSpanVerticalRun(span);
    if (
      [...tallBodyRubyColumns].some((column) => isRubyAdjacentToBodyColumn(ruby, column)) ||
      tallRubyAnchors.some((anchor) => isRubyAdjacentToBodyColumn(ruby, anchor))
    ) {
      used.add(span);
    }
  }

  for (const run of extractTallVerticalRuns(spans.filter((span) => !used.has(span)))) {
    blocks.push(toTallVerticalBlock(run));
    for (const span of run.spans) used.add(span);
  }

  const candidates = spans
    .filter((span) => !used.has(span))
    .filter((span) => isCompactCjkGlyph(span) && !hasCloseHorizontalNeighbour(span, spans))
    .sort((a, b) => centerX(a) - centerX(b) || a.y - b.y);

  const columns: TextSpan[][] = [];
  if (candidates.length >= VERTICAL_CJK_MIN_RUN_SPANS) {
    for (const candidate of candidates) {
      const last = columns.at(-1);
      if (!last) {
        columns.push([candidate]);
        continue;
      }
      const anchor = last[0];
      if (
        Math.abs(centerX(candidate) - centerX(anchor)) <=
        Math.max(verticalCjkXTolerance(candidate), verticalCjkXTolerance(anchor))
      ) {
        last.push(candidate);
      } else {
        columns.push([candidate]);
      }
    }

    for (const column of columns) {
      const sortedColumn = [...column].sort((a, b) => a.y - b.y || a.x - b.x);
      let run: TextSpan[] = [];
      const flush = () => {
        const block = toVerticalBlock(run);
        if (block) {
          blocks.push(block);
          for (const span of run) used.add(span);
        }
        run = [];
      };
      for (const span of sortedColumn) {
        const prev = run.at(-1);
        if (!prev || canContinueVerticalCjkRun(prev, span)) {
          run.push(span);
        } else {
          flush();
          run.push(span);
        }
      }
      flush();
    }
  }

  const bodyVertical = extractBodyVerticalCjkRunAnalysis(spans.filter((span) => !used.has(span)));
  for (const block of bodyVertical.blocks) {
    blocks.push(toBodyVerticalBlock(block, bodyVertical.rubyAssociations));
    for (const column of block.columns) {
      for (const span of column.spans) used.add(span);
    }
  }
  for (const span of bodyVertical.rubySpans) used.add(span);

  return {
    blocks,
    remainingSpans: spans.filter((span) => !used.has(span)),
  };
}

export function verticalRunTextWithRuby(
  column: VerticalCjkRun,
  rubyAssociations: readonly VerticalRubyAssociation[],
): string {
  const attachments = rubyAssociationsForColumn(column, rubyAssociations);
  if (attachments.length === 0) return column.spans.map((span) => span.text).join('');

  const byEndSpan = new Map<TextSpan, VerticalRubyAssociation[]>();
  for (const association of attachments) {
    const endRange = association.baseRanges.at(-1);
    if (!endRange) continue;
    const existing = byEndSpan.get(endRange.span);
    if (existing) {
      existing.push(association);
    } else {
      byEndSpan.set(endRange.span, [association]);
    }
  }

  let text = '';
  for (const span of column.spans) {
    const spanAttachments = byEndSpan.get(span);
    if (!spanAttachments) {
      text += span.text;
      continue;
    }
    text += spanTextWithRuby(span, spanAttachments);
  }
  return text;
}

export function rubyAssociationText(association: VerticalRubyAssociation): string {
  return association.ruby.spans.map((span) => span.text).join('');
}

function rubyAssociationsForColumn(
  column: VerticalCjkRun,
  rubyAssociations: readonly VerticalRubyAssociation[],
): VerticalRubyAssociation[] {
  return rubyAssociations
    .filter((association) => association.baseColumn === column)
    .sort((a, b) => {
      return (
        rubyAssociationBaseSortKey(column, a) - rubyAssociationBaseSortKey(column, b) ||
        bodyRunTop(a.ruby) - bodyRunTop(b.ruby)
      );
    });
}

function associateRubyRuns(
  rubyRuns: readonly VerticalCjkRun[],
  bodyColumns: readonly VerticalCjkRun[],
): VerticalRubyAssociation[] {
  const associations: VerticalRubyAssociation[] = [];
  for (const ruby of rubyRuns) {
    const candidates = bodyColumns
      .map((body) => rubyAssociationCandidate(ruby, body))
      .filter((candidate): candidate is VerticalRubyAssociation & { xGap: number } => candidate !== undefined)
      .sort((a, b) => a.xGap - b.xGap || b.confidence - a.confidence);
    if (candidates.length === 0) continue;
    if (hasAmbiguousAdjacentBodyColumn(ruby, candidates)) continue;
    const { xGap: _xGap, ...association } = candidates[0];
    associations.push(association);
  }
  return associations.sort(
    (a, b) => b.baseColumn.centerX - a.baseColumn.centerX || bodyRunTop(a.ruby) - bodyRunTop(b.ruby),
  );
}

function rubyAssociationCandidate(
  ruby: VerticalCjkRun,
  body: VerticalCjkRun,
): (VerticalRubyAssociation & { xGap: number }) | undefined {
  if (!isRubyAdjacentToBodyColumn(ruby, body)) return undefined;

  const baseRanges = overlappingBaseRanges(ruby, body);
  if (!baseRanges) return undefined;
  const baseSpans = baseSpansFromRanges(baseRanges);

  const confidence = rubyAssociationConfidence(ruby, body, baseRanges);
  if (confidence < RUBY_ASSOCIATION_MIN_CONFIDENCE) return undefined;

  return {
    ruby,
    baseColumn: body,
    baseSpans,
    baseRanges,
    confidence,
    xGap: ruby.centerX - body.centerX,
  };
}

function isRubyAdjacentToBodyColumn(ruby: VerticalCjkRun, body: VerticalCjkRun): boolean {
  if (ruby.fontSize > body.fontSize * RUBY_VERTICAL_CJK_MAX_FONT_RATIO) return false;

  const gap = ruby.centerX - body.centerX;
  if (gap <= 0 || gap > body.fontSize * RUBY_VERTICAL_CJK_MAX_BODY_GAP_RATIO) return false;

  const overlap = Math.min(bodyRunBottom(ruby), bodyRunBottom(body)) - Math.max(bodyRunTop(ruby), bodyRunTop(body));
  return overlap > 0;
}

function overlappingBaseRanges(ruby: VerticalCjkRun, body: VerticalCjkRun): VerticalRubyBaseRange[] | undefined {
  const rubyTop = bodyRunTop(ruby);
  const rubyBottom = bodyRunBottom(ruby);
  const rubyHeight = Math.max(rubyBottom - rubyTop, 1);
  const baseRanges = baseCharacterRanges(body);
  const overlaps = baseRanges.map((range, index) => {
    const overlap = Math.min(range.y + range.height, rubyBottom) - Math.max(range.y, rubyTop);
    const bodyOverlapRatio = overlap / Math.max(range.height, 1);
    const rubyOverlapRatio = overlap / rubyHeight;
    return { index, range, overlap, bodyOverlapRatio, rubyOverlapRatio };
  });
  const positive = overlaps.filter((item) => item.overlap > 0);
  if (positive.length === 0) return undefined;

  if (countConsecutiveGroups(positive.map((item) => item.index)) > 1) return undefined;

  const base = positive.filter(
    (item) =>
      item.bodyOverlapRatio >= RUBY_ASSOCIATION_MIN_BODY_OVERLAP_RATIO ||
      item.rubyOverlapRatio >= RUBY_ASSOCIATION_MIN_RUBY_OVERLAP_RATIO,
  );
  if (base.length === 0) return undefined;

  const baseIndices = base.map((item) => item.index);
  if (countConsecutiveGroups(baseIndices) > 1) return undefined;

  const selectedRanges = mergeConsecutiveBaseRanges(base.sort((a, b) => a.index - b.index).map((item) => item.range));
  if (selectedRanges.length === 0) return undefined;
  const baseTop = Math.min(...selectedRanges.map((range) => range.y));
  const baseBottom = Math.max(...selectedRanges.map((range) => range.y + range.height));
  const baseHeight = Math.max(baseBottom - baseTop, 1);
  if (base.length > 1 && rubyHeight / baseHeight < RUBY_ASSOCIATION_MIN_MULTI_BASE_HEIGHT_RATIO) return undefined;

  return selectedRanges;
}

function countConsecutiveGroups(indices: readonly number[]): number {
  if (indices.length === 0) return 0;
  const sorted = [...indices].sort((a, b) => a - b);
  let groups = 1;
  for (let index = 1; index < sorted.length; index++) {
    if (sorted[index] !== sorted[index - 1] + 1) groups++;
  }
  return groups;
}

function rubyAssociationConfidence(
  ruby: VerticalCjkRun,
  body: VerticalCjkRun,
  baseRanges: readonly VerticalRubyBaseRange[],
): number {
  const rubyTop = bodyRunTop(ruby);
  const rubyBottom = bodyRunBottom(ruby);
  const rubyHeight = Math.max(rubyBottom - rubyTop, 1);
  const baseTop = Math.min(...baseRanges.map((range) => range.y));
  const baseBottom = Math.max(...baseRanges.map((range) => range.y + range.height));
  const baseHeight = Math.max(baseBottom - baseTop, 1);
  const overlap = baseRanges.reduce(
    (sum, range) => sum + Math.max(0, Math.min(range.y + range.height, rubyBottom) - Math.max(range.y, rubyTop)),
    0,
  );
  const overlapConfidence = Math.min(1, overlap / Math.max(rubyHeight, baseHeight));
  const centerDistance = Math.abs((baseTop + baseBottom) / 2 - runCenterY(ruby));
  const centerConfidence = Math.max(0, 1 - centerDistance / Math.max(rubyHeight, baseHeight));
  const maxGap = Math.max(body.fontSize * RUBY_VERTICAL_CJK_MAX_BODY_GAP_RATIO, 0.001);
  const xConfidence = Math.max(0, 1 - (ruby.centerX - body.centerX) / maxGap);
  return round2(overlapConfidence * 0.5 + centerConfidence * 0.3 + xConfidence * 0.2);
}

function hasAmbiguousAdjacentBodyColumn(
  ruby: VerticalCjkRun,
  candidates: readonly (VerticalRubyAssociation & { xGap: number })[],
): boolean {
  if (candidates.length < 2) return false;
  const [best, next] = candidates;
  const tieTolerance = Math.max(ruby.fontSize * RUBY_ASSOCIATION_X_TIE_RATIO, 0.001);
  return Math.abs(next.xGap - best.xGap) <= tieTolerance;
}

function baseCharacterRanges(body: VerticalCjkRun): VerticalRubyBaseRange[] {
  const ranges: VerticalRubyBaseRange[] = [];
  for (const span of body.spans) {
    const virtualRanges = uniformTallSpanCharacterRanges(span);
    if (virtualRanges) {
      ranges.push(...virtualRanges);
    } else {
      ranges.push({ span, start: 0, end: span.text.length, y: span.y, height: span.height });
    }
  }
  return ranges;
}

function uniformTallSpanCharacterRanges(span: TextSpan): VerticalRubyBaseRange[] | undefined {
  if (!isTallBodyVerticalCjkSpan(span) || !isUniformTallVerticalBaseSpan(span)) return undefined;
  const chars = Array.from(span.text);
  if (chars.length === 0) return undefined;

  const pitch = span.height / chars.length;
  const ranges: VerticalRubyBaseRange[] = [];
  let offset = 0;
  for (let index = 0; index < chars.length; index++) {
    const char = chars[index];
    ranges.push({
      span,
      start: offset,
      end: offset + char.length,
      y: span.y + pitch * index,
      height: pitch,
    });
    offset += char.length;
  }
  return ranges;
}

function mergeConsecutiveBaseRanges(ranges: readonly VerticalRubyBaseRange[]): VerticalRubyBaseRange[] {
  const merged: VerticalRubyBaseRange[] = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && previous.span === range.span && previous.end === range.start) {
      previous.end = range.end;
      previous.height = range.y + range.height - previous.y;
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function baseSpansFromRanges(ranges: readonly VerticalRubyBaseRange[]): TextSpan[] {
  const spans: TextSpan[] = [];
  for (const range of ranges) {
    if (spans.at(-1) !== range.span) spans.push(range.span);
  }
  return spans;
}

function spanTextWithRuby(span: TextSpan, associations: readonly VerticalRubyAssociation[]): string {
  const sorted = [...associations].sort((a, b) => {
    const aEnd = a.baseRanges.at(-1);
    const bEnd = b.baseRanges.at(-1);
    return (aEnd?.end ?? 0) - (bEnd?.end ?? 0) || bodyRunTop(a.ruby) - bodyRunTop(b.ruby);
  });
  let out = '';
  let cursor = 0;
  for (const association of sorted) {
    const endRange = association.baseRanges.at(-1);
    if (!endRange) continue;
    const offset = Math.max(cursor, Math.min(span.text.length, endRange.end));
    out += span.text.slice(cursor, offset);
    out += `《${rubyAssociationText(association)}》`;
    cursor = offset;
  }
  return out + span.text.slice(cursor);
}

function rubyAssociationBaseSortKey(column: VerticalCjkRun, association: VerticalRubyAssociation): number {
  const firstRange = association.baseRanges[0];
  if (!firstRange) return Number.POSITIVE_INFINITY;
  let offset = 0;
  for (const span of column.spans) {
    if (span === firstRange.span) return offset + firstRange.start;
    offset += span.text.length;
  }
  return Number.POSITIVE_INFINITY;
}

export function compareLayoutBlocks(a: LayoutBlock, b: LayoutBlock): number {
  if (a.writingMode === 'vertical' && b.writingMode === 'vertical' && verticalBlocksShareReadingBand(a, b)) {
    return b.x - a.x || a.y - b.y;
  }
  return a.y - b.y || a.x - b.x;
}

function verticalBlocksShareReadingBand(a: LayoutBlock, b: LayoutBlock): boolean {
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const minHeight = Math.max(Math.min(a.height, b.height), 1);
  return overlap / minHeight >= VERTICAL_LINE_OVERLAP_RATIO;
}

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
  if (bodyRuns.length === 0) return { blocks: [], rubySpans: [] };

  const rubyRuns = collectBodyVerticalCjkRuns(spans, 1).filter((run) => isRubyVerticalRun(run, bodyRuns));
  const rubySpanSet = new Set<TextSpan>();
  const rubySpans: TextSpan[] = [];
  for (const run of rubyRuns) {
    for (const span of run.spans) {
      rubySpanSet.add(span);
      rubySpans.push(span);
    }
  }

  const nonRubyBodyRuns = bodyRuns.filter((run) => !run.spans.some((span) => rubySpanSet.has(span)));
  const shortBodyRuns = collectShortBodyVerticalCjkRuns(spans, nonRubyBodyRuns, rubySpanSet);

  return {
    blocks: groupBodyVerticalRunsIntoBlocks([...nonRubyBodyRuns, ...shortBodyRuns]),
    rubySpans: rubySpans.sort((a, b) => centerX(b) - centerX(a) || a.y - b.y),
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

function toBodyVerticalBlock(block: VerticalCjkRunBlock): LayoutBlock {
  const columns = [...block.columns].sort((a, b) => b.centerX - a.centerX || bodyRunTop(a) - bodyRunTop(b));
  const lines: LayoutLine[] = columns.map((column) => {
    const box = unionBox(column.spans);
    return {
      text: column.spans.map((span) => span.text).join(''),
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
  for (const run of extractTallVerticalRuns(spans)) {
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
    blocks.push(toBodyVerticalBlock(block));
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

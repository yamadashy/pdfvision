import type { TextSpan } from '../../../types/index.js';
import { mode, round2 } from '../geometry.js';
import {
  BODY_VERTICAL_CJK_GLYPH_RE,
  BODY_VERTICAL_LEADER_GLYPH_RE,
  bodyRunBottom,
  bodyRunTop,
  bodyVerticalCjkXTolerance,
  centerX,
  containsCjkScript,
  FONT_SIZE_FALLBACK_PT,
  isTallCjkVerticalSpan,
  isUniformVerticalBaseChar,
  TATECHUYOKO_COLUMN_GAP_RATIO,
  TATECHUYOKO_COLUMN_OVERLAP_RATIO,
  toVerticalGlyphRun,
  type VerticalCjkRun,
  type VerticalCjkRunBlock,
} from './shared.js';

/** Body-sized Japanese vertical text is emitted by pdf.js as one
 *  square-ish CJK glyph per span. Unlike the display-title path, this
 *  cannot use a font-size gate. Instead it requires a long descending run
 *  at a stable x position; single-row table labels and multi-character
 *  horizontal spans cannot satisfy that signature. */
export const BODY_VERTICAL_CJK_MIN_RUN_SPANS = 5;
const BODY_VERTICAL_CJK_MIN_STEP_RATIO = 0.7;
const BODY_VERTICAL_CJK_MAX_STEP_RATIO = 1.8;
const BODY_VERTICAL_CJK_MAX_GLYPH_SIZE_RATIO = 1.8;
const BODY_VERTICAL_CJK_MAX_COLUMN_GAP_RATIO = 3;
const BODY_VERTICAL_CJK_MAX_COLUMN_GAP_PT = 36;
const BODY_VERTICAL_CJK_COLUMN_OVERLAP_RATIO = 0.05;
const SHORT_BODY_VERTICAL_CJK_MIN_RUN_SPANS = 3;
const SHORT_BODY_VERTICAL_CJK_MIN_FONT_RATIO = 0.75;
const SHORT_BODY_VERTICAL_CJK_MAX_FONT_RATIO = 1.25;
const BODY_VERTICAL_INLINE_GLYPH_RE = /^[A-Za-z()]$/u;

function isBodyVerticalCjkGlyph(span: TextSpan): boolean {
  const text = span.text.trim();
  if (!BODY_VERTICAL_CJK_GLYPH_RE.test(text)) return false;
  if ([...text].length !== 1) return false;

  return hasBodyVerticalGlyphBox(span);
}

function isBodyVerticalRunGlyph(span: TextSpan): boolean {
  return isBodyVerticalCjkGlyph(span) || isBodyVerticalInlineGlyph(span);
}

function isBodyVerticalInlineGlyph(span: TextSpan): boolean {
  const text = span.text.trim();
  if (!BODY_VERTICAL_INLINE_GLYPH_RE.test(text)) return false;
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

export function collectBodyVerticalCjkRuns(spans: readonly TextSpan[], minRunSpans: number): VerticalCjkRun[] {
  const candidates = spans.filter(isBodyVerticalRunGlyph).sort((a, b) => centerX(b) - centerX(a) || a.y - b.y);
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
      const verticalRun = toBodyVerticalGlyphRun(run, minRunSpans);
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

function toBodyVerticalGlyphRun(run: TextSpan[], minRunSpans: number): VerticalCjkRun | undefined {
  if (!run.some(isBodyVerticalCjkGlyph)) return undefined;
  return toVerticalGlyphRun(run, minRunSpans);
}

export function collectTallBodyVerticalCjkRuns(spans: readonly TextSpan[]): {
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

export function isTallBodyVerticalCjkSpan(span: TextSpan): boolean {
  const chars = Array.from(span.text);
  if (chars.length < BODY_VERTICAL_CJK_MIN_RUN_SPANS) return false;
  if (!isTallCjkVerticalSpan(span)) return false;

  const fontSize = span.fontSize || FONT_SIZE_FALLBACK_PT;
  const pitch = span.height / Math.max(chars.length, 1);
  return pitch >= fontSize * BODY_VERTICAL_CJK_MIN_STEP_RATIO && pitch <= fontSize * BODY_VERTICAL_CJK_MAX_STEP_RATIO;
}

export function isUniformTallVerticalBaseSpan(span: TextSpan): boolean {
  return Array.from(span.text).every(isUniformVerticalBaseChar);
}

function isAssociableTallBodyRunSpan(span: TextSpan): boolean {
  return isBodyVerticalCjkGlyph(span) || isUniformTallVerticalBaseSpan(span);
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

export function collectShortBodyVerticalCjkRuns(
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

export function groupBodyVerticalRunsIntoBlocks(runs: readonly VerticalCjkRun[]): VerticalCjkRunBlock[] {
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

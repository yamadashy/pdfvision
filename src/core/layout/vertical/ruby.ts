import type { TextSpan } from '../../../types/index.js';
import { round2 } from '../geometry.js';
import {
  BODY_VERTICAL_CJK_MIN_RUN_SPANS,
  collectBodyVerticalCjkRuns,
  collectShortBodyVerticalCjkRuns,
  collectTallBodyVerticalCjkRuns,
  groupBodyVerticalRunsIntoBlocks,
  isTallBodyVerticalCjkSpan,
  isUniformTallVerticalBaseSpan,
} from './bodyRuns.js';
import {
  type BodyVerticalCjkRunAnalysis,
  bodyRunBottom,
  bodyRunTop,
  bodyVerticalCjkXTolerance,
  CJK_SCRIPT_RE,
  centerX,
  FONT_SIZE_FALLBACK_PT,
  isUniformVerticalBaseChar,
  runCenterY,
  TATECHUYOKO_COLUMN_GAP_RATIO,
  TATECHUYOKO_COLUMN_OVERLAP_RATIO,
  toVerticalGlyphRun,
  type VerticalCjkRun,
  type VerticalCjkRunBlock,
  type VerticalRubyAssociation,
  type VerticalRubyBaseRange,
} from './shared.js';

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
const GUTTER_ANNOTATION_MAX_SPANS = 6;
const GUTTER_ANNOTATION_MAX_FONT_RATIO = 0.9;
const GUTTER_ANNOTATION_MAX_GLYPH_SIZE_RATIO = 1.8;

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
  if (bodyAnchorRuns.length === 0)
    return { blocks: [], rubySpans: [], gutterAnnotationSpans: [], rubyAssociations: [] };

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
  const gutterAnnotationRuns = collectGutterAnnotationRuns(spans, bodyColumns, rubySpanSet);
  const gutterAnnotationSpans = gutterAnnotationRuns
    .flatMap((run) => run.spans)
    .sort((a, b) => centerX(b) - centerX(a) || a.y - b.y);

  return {
    blocks: groupBodyVerticalRunsIntoBlocks(bodyColumns),
    rubySpans: rubySpans.sort((a, b) => centerX(b) - centerX(a) || a.y - b.y),
    gutterAnnotationSpans,
    rubyAssociations: associateRubyRuns(rubyRuns, bodyColumns),
  };
}

export function extractBodyVerticalCjkRunBlocks(spans: readonly TextSpan[]): VerticalCjkRunBlock[] {
  return extractBodyVerticalCjkRunAnalysis(spans).blocks;
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

export function isRubyAdjacentToBodyColumn(ruby: VerticalCjkRun, body: VerticalCjkRun): boolean {
  if (ruby.fontSize > body.fontSize * RUBY_VERTICAL_CJK_MAX_FONT_RATIO) return false;

  const gap = ruby.centerX - body.centerX;
  if (gap <= 0 || gap > body.fontSize * RUBY_VERTICAL_CJK_MAX_BODY_GAP_RATIO) return false;

  const overlap = Math.min(bodyRunBottom(ruby), bodyRunBottom(body)) - Math.max(bodyRunTop(ruby), bodyRunTop(body));
  return overlap > 0;
}

function collectGutterAnnotationRuns(
  spans: readonly TextSpan[],
  bodyColumns: readonly VerticalCjkRun[],
  excludedSpans: ReadonlySet<TextSpan>,
): VerticalCjkRun[] {
  if (bodyColumns.length === 0) return [];

  const bodySpans = new Set<TextSpan>();
  for (const body of bodyColumns) {
    for (const span of body.spans) bodySpans.add(span);
  }

  const candidatesByBody = new Map<VerticalCjkRun, TextSpan[]>();
  for (const span of spans) {
    if (bodySpans.has(span) || excludedSpans.has(span)) continue;
    const body = nearestGutterAnnotationBody(span, bodyColumns);
    if (!body) continue;
    const existing = candidatesByBody.get(body);
    if (existing) {
      existing.push(span);
    } else {
      candidatesByBody.set(body, [span]);
    }
  }

  const runs: VerticalCjkRun[] = [];
  const claimed = new Set<TextSpan>();
  for (const [body, candidates] of candidatesByBody) {
    const columns = groupGutterAnnotationColumns(candidates.filter((span) => !claimed.has(span)));
    for (const column of columns) {
      const sortedColumn = [...column].sort((a, b) => a.y - b.y || a.x - b.x);
      let run: TextSpan[] = [];
      const flush = () => {
        const verticalRun = toVerticalGlyphRun(run, 1);
        if (verticalRun && isGutterAnnotationRun(verticalRun, body)) {
          runs.push(verticalRun);
          for (const span of verticalRun.spans) claimed.add(span);
        }
        run = [];
      };
      for (const span of sortedColumn) {
        const prev = run.at(-1);
        if (!prev || canContinueGutterAnnotationRun(prev, span)) {
          run.push(span);
        } else {
          flush();
          run.push(span);
        }
      }
      flush();
    }
  }

  return runs;
}

function nearestGutterAnnotationBody(
  span: TextSpan,
  bodyColumns: readonly VerticalCjkRun[],
): VerticalCjkRun | undefined {
  const spanCenter = centerX(span);
  let best: VerticalCjkRun | undefined;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const body of bodyColumns) {
    if (!isGutterAnnotationSpanCandidate(span, body)) continue;
    const gap = spanCenter - body.centerX;
    if (gap >= bestGap) continue;
    best = body;
    bestGap = gap;
  }
  return best;
}

function isGutterAnnotationSpanCandidate(span: TextSpan, body: VerticalCjkRun): boolean {
  if (span.text.trim().length === 0) return false;

  const spanFontSize = span.fontSize || span.height || FONT_SIZE_FALLBACK_PT;
  const bodyFontSize = Math.max(body.fontSize || FONT_SIZE_FALLBACK_PT, 0.001);
  const fontRatio = spanFontSize / bodyFontSize;
  if (fontRatio <= RUBY_VERTICAL_CJK_MAX_FONT_RATIO || fontRatio > GUTTER_ANNOTATION_MAX_FONT_RATIO) return false;
  if (
    span.width > spanFontSize * GUTTER_ANNOTATION_MAX_GLYPH_SIZE_RATIO ||
    span.height > spanFontSize * GUTTER_ANNOTATION_MAX_GLYPH_SIZE_RATIO
  ) {
    return false;
  }

  const gap = centerX(span) - body.centerX;
  if (gap <= 0 || gap > bodyFontSize * RUBY_VERTICAL_CJK_MAX_BODY_GAP_RATIO) return false;

  const overlap = Math.min(span.y + span.height, bodyRunBottom(body)) - Math.max(span.y, bodyRunTop(body));
  return overlap > 0;
}

function groupGutterAnnotationColumns(spans: readonly TextSpan[]): TextSpan[][] {
  const columns: TextSpan[][] = [];
  for (const span of [...spans].sort((a, b) => centerX(b) - centerX(a) || a.y - b.y)) {
    const column = columns.find((item) => {
      const anchor = item[0];
      return (
        Math.abs(centerX(span) - centerX(anchor)) <=
        Math.max(bodyVerticalCjkXTolerance(span), bodyVerticalCjkXTolerance(anchor))
      );
    });
    if (column) {
      column.push(span);
    } else {
      columns.push([span]);
    }
  }
  return columns;
}

function canContinueGutterAnnotationRun(prev: TextSpan, cur: TextSpan): boolean {
  if (
    Math.abs(centerX(cur) - centerX(prev)) > Math.max(bodyVerticalCjkXTolerance(prev), bodyVerticalCjkXTolerance(cur))
  ) {
    return false;
  }
  const fontSize = Math.max(prev.fontSize || prev.height || FONT_SIZE_FALLBACK_PT, cur.fontSize || cur.height || 0);
  const gap = cur.y - (prev.y + prev.height);
  return gap >= -fontSize * TATECHUYOKO_COLUMN_OVERLAP_RATIO && gap <= fontSize * TATECHUYOKO_COLUMN_GAP_RATIO;
}

function isGutterAnnotationRun(run: VerticalCjkRun, body: VerticalCjkRun): boolean {
  if (run.spans.length === 0 || run.spans.length > GUTTER_ANNOTATION_MAX_SPANS) return false;
  return run.spans.every((span) => isGutterAnnotationSpanCandidate(span, body));
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

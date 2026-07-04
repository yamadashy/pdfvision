import type { LayoutBlock, LayoutLine, TextSpan } from '../../../types/index.js';
import { isCjkLeading } from '../../text/cjkJoin.js';
import { mode, round2, unionBox } from '../geometry.js';
import { collectTallBodyVerticalCjkRuns, isTallBodyVerticalCjkSpan } from './bodyRuns.js';
import { extractBodyVerticalCjkRunAnalysis, isRubyAdjacentToBodyColumn, verticalRunTextWithRuby } from './ruby.js';
import {
  bodyRunTop,
  centerX,
  containsCjkScript,
  FONT_SIZE_FALLBACK_PT,
  isTallCjkVerticalSpan,
  TATECHUYOKO_COLUMN_GAP_RATIO,
  TATECHUYOKO_COLUMN_OVERLAP_RATIO,
  type TallVerticalRun,
  toSingleSpanVerticalRun,
  type VerticalCjkRunBlock,
  type VerticalRubyAssociation,
} from './shared.js';

const VERTICAL_LINE_OVERLAP_RATIO = 0.35;

/** Detect display-sized CJK vertical stacks conservatively. Body/table
 *  labels can align at the same x across rows, so small font sizes stay
 *  in the normal horizontal layout pass. The horizontal-neighbour cap
 *  keeps large vertical title columns from suppressing each other while
 *  still preserving ordinary CJK glyph rows. */
const VERTICAL_CJK_MAX_CHARS = 2;
const VERTICAL_CJK_MIN_RUN_SPANS = 2;
const VERTICAL_CJK_MIN_FONT_SIZE_PT = 20;
const VERTICAL_CJK_X_TOLERANCE_RATIO = 0.45;
const VERTICAL_CJK_X_TOLERANCE_MIN_PT = 4;
const VERTICAL_CJK_STEP_RATIO = 1.8;
const VERTICAL_CJK_HORIZONTAL_NEIGHBOUR_RATIO = 0.85;
const VERTICAL_CJK_HORIZONTAL_NEIGHBOUR_MAX_PT = 32;
const VERTICAL_CJK_MIN_HEIGHT_RATIO = 1.5;
const TATECHUYOKO_MAX_CHARS = 4;
const TATECHUYOKO_MAX_WIDTH_RATIO = 2.2;
const TATECHUYOKO_MAX_HEIGHT_RATIO = 1.5;
const SHORT_VERTICAL_CJK_MAX_CHARS = 4;
const SHORT_VERTICAL_CJK_MAX_WIDTH_RATIO = 1.6;
const SHORT_VERTICAL_CJK_MIN_HEIGHT_RATIO = 0.7;
const SHORT_VERTICAL_CJK_MAX_HEIGHT_RATIO = 1.35;
const TATECHUYOKO_FRAGMENT_RE = /^[0-9０-９()（）]+$/u;

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

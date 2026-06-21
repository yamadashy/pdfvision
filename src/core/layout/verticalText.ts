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
  if (!isCjkLeading(text)) return false;
  const charCount = [...text].length;
  if (charCount < TALL_VERTICAL_CJK_MIN_CHARS) return false;
  if (!hasVerticalTextShape(span)) return false;

  const fontSize = span.fontSize || FONT_SIZE_FALLBACK_PT;
  if (span.width > fontSize * 1.6) return false;
  return span.height >= fontSize * charCount * TALL_VERTICAL_CJK_MIN_CHAR_HEIGHT_RATIO;
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

function toTallVerticalBlock(span: TextSpan): LayoutBlock {
  const box = unionBox([span]);
  const fontSize = round2(span.fontSize || FONT_SIZE_FALLBACK_PT);
  const line: LayoutLine = {
    text: span.text.trim(),
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
  for (const span of spans) {
    if (!isTallCjkVerticalSpan(span)) continue;
    blocks.push(toTallVerticalBlock(span));
    used.add(span);
  }

  const candidates = spans
    .filter((span) => !used.has(span))
    .filter((span) => isCompactCjkGlyph(span) && !hasCloseHorizontalNeighbour(span, spans))
    .sort((a, b) => centerX(a) - centerX(b) || a.y - b.y);
  if (candidates.length < VERTICAL_CJK_MIN_RUN_SPANS) {
    return { blocks, remainingSpans: spans.filter((span) => !used.has(span)) };
  }

  const columns: TextSpan[][] = [];
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

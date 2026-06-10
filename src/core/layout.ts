import type { LayoutBlock, LayoutLine, LayoutTable, PageLayout, PageResult, TextSpan } from '../types/index.js';
import { CJK_TIGHT_GAP_RATIO, isCjkLeading } from './cjkJoin.js';
import { shouldInsertSemanticSpace } from './spacing.js';

interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Round to 2dp — keeps coordinates compact in JSON. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Bounding box that encloses every item in `items`. Each item just needs
 * x / y / width / height — works for spans (line clustering) and lines
 * (block clustering) alike. Returns rounded coords ready for the public shape.
 */
function unionBox(items: readonly BBox[]): BBox {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    if (item.x < minX) minX = item.x;
    if (item.y < minY) minY = item.y;
    if (item.x + item.width > maxX) maxX = item.x + item.width;
    if (item.y + item.height > maxY) maxY = item.y + item.height;
  }
  return {
    x: round2(minX),
    y: round2(minY),
    width: round2(maxX - minX),
    height: round2(maxY - minY),
  };
}

/** Most common value in `nums` — used for the dominant font size of a line. */
function mode(nums: number[]): number {
  const counts = new Map<number, number>();
  let best = nums[0];
  let bestCount = 0;
  for (const n of nums) {
    const c = (counts.get(n) ?? 0) + 1;
    counts.set(n, c);
    if (c > bestCount) {
      best = n;
      bestCount = c;
    }
  }
  return best;
}

/**
 * Median of `values`. Returns 0 for an empty array (caller should guard).
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Gap fraction for non-CJK pairs — pdf.js typically packs inter-word
 *  spaces around 0.25 × fontSize. Preserves the pre-fix behavior for
 *  Latin / digits / punctuation. CJK pairs use {@link CJK_TIGHT_GAP_RATIO}
 *  imported from cjkJoin so primary text and layout-block text classify
 *  the same gap identically. */
const DEFAULT_SPACE_GAP_RATIO = 0.25;

/** Fallback fontSize when both prev and cur report 0 (rare — usually
 *  malformed PDFs that strip the text matrix scale). Without this the
 *  threshold would collapse to 0 and any positive gap would synthesize
 *  a space, fragmenting the text into single glyphs (`s p a c e d`).
 *  12pt matches the most common Western body fontSize and is harmless
 *  as a heuristic backstop. */
const FONT_SIZE_FALLBACK_PT = 12;
/** Visual gutter threshold for splitting one y-row into separate layout
 *  lines. IRS-style three-column instructions have gutters around 18pt:
 *  much wider than a word gap, but well below the old 5× font-size rule. */
const LAYOUT_SEGMENT_GAP_RATIO = 1.5;
const LAYOUT_SEGMENT_MIN_GAP_PT = 16;
const RECURRING_GUTTER_GAP_RATIO = 1.05;
const RECURRING_GUTTER_MIN_GAP_PT = 9;
const RECURRING_GUTTER_WIDE_ROW_RATIO = 0.7;
const RECURRING_GUTTER_SIDE_MIN_RATIO = 0.25;
const RECURRING_GUTTER_BIN_PT = 5;
const RECURRING_GUTTER_MIN_ROWS = 3;
const RECURRING_TABLE_GUTTER_MIN_ROWS = 4;
const RECURRING_TABLE_GUTTER_MIN_NUMERIC_SPANS = 3;
const LINE_TOP_ALIGNMENT_RATIO = 0.5;
const LINE_VERTICAL_OVERLAP_RATIO = 0.35;
const TABLE_ROW_MIN_CELLS = 3;
const TABLE_ROW_MIN_NUMERIC_CELLS = 2;
const TABLE_GROUP_MAX_ROW_GAP_PT = 48;
const TABLE_ROW_CADENCE_MIN_MATCH_RATIO = 0.65;
const TABLE_ROW_CADENCE_TOLERANCE_RATIO = 0.25;
const TABLE_ROW_CADENCE_MIN_TOLERANCE_PT = 2;
const TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROWS = 4;
const TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS = 3;
const TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROW_RATIO = 0.6;
const TABLE_RECURRING_NUMERIC_COLUMN_TOLERANCE_PT = 10;
const REPEATED_CHROME_EDGE_RATIO = 0.1;
const REPEATED_CHROME_MIN_EDGE_PT = 60;
const REPEATED_CHROME_LINE_MIN_TEXT_LENGTH = 20;
const REPEATED_CHROME_LINE_MIN_WIDTH_RATIO = 0.2;
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
const VERTICAL_CJK_MIN_RUN_SPANS = 2;
const VERTICAL_CJK_MIN_FONT_SIZE_PT = 20;
const VERTICAL_CJK_X_TOLERANCE_RATIO = 0.45;
const VERTICAL_CJK_X_TOLERANCE_MIN_PT = 4;
const VERTICAL_CJK_STEP_RATIO = 1.8;
const VERTICAL_CJK_HORIZONTAL_NEIGHBOUR_RATIO = 0.85;
const VERTICAL_CJK_HORIZONTAL_NEIGHBOUR_MAX_PT = 32;
const VERTICAL_CJK_MIN_HEIGHT_RATIO = 1.5;

/**
 * Join the spans of a single layout line into a readable string. pdfjs
 * emits whitespace as separate items (already filtered upstream) but for
 * CJK it also splits adjacent characters into per-glyph spans. A naive
 * ' ' join produces `背景・ 目 的` for what is really `背景・目的`. Use
 * the visual gap between consecutive spans as a proxy: if it's at least
 * a quarter of the font size we treat them as different words and insert
 * a single space, otherwise we concatenate. CJK glyph pairs use the
 * tighter shared threshold so the layout-side classification matches
 * the primary `joinPageText` behavior on the same gap.
 */
function joinLineSpans(xSorted: TextSpan[]): string {
  if (xSorted.length === 0) return '';
  let out = xSorted[0].text;
  for (let i = 1; i < xSorted.length; i++) {
    const prev = xSorted[i - 1];
    const cur = xSorted[i];
    const gap = cur.x - (prev.x + prev.width);
    const bothCjk = isCjkLeading(prev.text) && isCjkLeading(cur.text);
    // Prefer the current span's fontSize; fall back to the previous
    // span's, then to a Western-body default. A 0 fontSize on both
    // sides would otherwise zero the threshold and turn every gap
    // into a synthesized space.
    const fontSize = cur.fontSize || prev.fontSize || FONT_SIZE_FALLBACK_PT;
    const threshold = fontSize * (bothCjk ? CJK_TIGHT_GAP_RATIO : DEFAULT_SPACE_GAP_RATIO);
    out += gap > threshold || shouldInsertSemanticSpace(prev.text, cur.text, gap, fontSize) ? ` ${cur.text}` : cur.text;
  }
  return out;
}

function hasVerticalTextShape(span: TextSpan): boolean {
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

function hasCloseHorizontalNeighbour(span: TextSpan, spans: readonly TextSpan[]): boolean {
  const fontSize = span.fontSize || span.height || FONT_SIZE_FALLBACK_PT;
  const maxGap = Math.min(fontSize * VERTICAL_CJK_HORIZONTAL_NEIGHBOUR_RATIO, VERTICAL_CJK_HORIZONTAL_NEIGHBOUR_MAX_PT);
  for (const other of spans) {
    if (other === span || other.text.trim().length === 0) continue;
    const minHeight = Math.max(Math.min(span.height, other.height), 1);
    const overlap = Math.min(span.y + span.height, other.y + other.height) - Math.max(span.y, other.y);
    if (overlap < minHeight * LINE_VERTICAL_OVERLAP_RATIO) continue;

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

function extractVerticalCjkBlocks(spans: readonly TextSpan[]): {
  blocks: LayoutBlock[];
  remainingSpans: TextSpan[];
} {
  const candidates = spans
    .filter((span) => isCompactCjkGlyph(span) && !hasCloseHorizontalNeighbour(span, spans))
    .sort((a, b) => centerX(a) - centerX(b) || a.y - b.y);
  if (candidates.length < VERTICAL_CJK_MIN_RUN_SPANS) return { blocks: [], remainingSpans: [...spans] };

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

  const used = new Set<TextSpan>();
  const blocks: LayoutBlock[] = [];
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

function canShareLine(a: TextSpan, b: TextSpan): boolean {
  return hasVerticalTextShape(a) === hasVerticalTextShape(b);
}

function canShareTextLine(a: TextSpan, b: TextSpan): boolean {
  if (!canShareLine(a, b)) return false;
  if (hasVerticalTextShape(a) || hasVerticalTextShape(b)) {
    const minHeight = Math.max(Math.min(a.height, b.height), 1);
    if (Math.abs(a.y - b.y) < minHeight * LINE_TOP_ALIGNMENT_RATIO) return true;
    const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return overlap >= minHeight * LINE_VERTICAL_OVERLAP_RATIO;
  }

  const aHeight = horizontalLineGroupingHeight(a);
  const bHeight = horizontalLineGroupingHeight(b);
  const minHeight = Math.max(Math.min(aHeight, bHeight), 1);
  if (Math.abs(a.y - b.y) < minHeight * LINE_TOP_ALIGNMENT_RATIO) return true;
  const overlap = Math.min(a.y + aHeight, b.y + bHeight) - Math.max(a.y, b.y);
  return overlap >= minHeight * LINE_VERTICAL_OVERLAP_RATIO;
}

function horizontalLineGroupingHeight(span: TextSpan): number {
  const fontSize = span.fontSize || FONT_SIZE_FALLBACK_PT;
  return Math.max(1, Math.min(span.height || fontSize, fontSize * 1.4));
}

function lineGroupAnchor(group: TextSpan[]): TextSpan {
  const candidates = group.filter((span) => !hasVerticalTextShape(span));
  const usable = candidates.length > 0 ? candidates : group;
  const medianHeight = median(usable.map((span) => span.height || span.fontSize || FONT_SIZE_FALLBACK_PT));
  return usable.reduce((best, span) => {
    const bestHeight = best.height || best.fontSize || FONT_SIZE_FALLBACK_PT;
    const height = span.height || span.fontSize || FONT_SIZE_FALLBACK_PT;
    const bestDistance = Math.abs(bestHeight - medianHeight);
    const distance = Math.abs(height - medianHeight);
    if (distance < bestDistance) return span;
    if (distance === bestDistance && height < bestHeight) return span;
    return best;
  });
}

function canShareTableRow(a: LayoutLine, b: LayoutLine): boolean {
  const minHeight = Math.max(Math.min(a.height, b.height), 1);
  if (Math.abs(a.y - b.y) < minHeight * LINE_TOP_ALIGNMENT_RATIO) return true;
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlap >= minHeight * LINE_VERTICAL_OVERLAP_RATIO;
}

/** Min non-whitespace chars at the body font size required before low-tier
 *  (level 2 with structural support, or level 3) headings may fire. Pages
 *  with less body text than this — slide decks, posters, title pages — only
 *  get level 1 headings, so a uniform-large page doesn't end up tagged as
 *  "all headings". Empirically ~100 chars is one short paragraph. */
const MIN_BODY_CHARS_FOR_LOW_TIER = 100;
const TOP_TITLE_MAX_Y = 120;
const TOP_TITLE_MIN_WIDTH = 180;
const TOP_TITLE_MIN_CHARS = 25;
const TOP_BYLINE_MAX_GAP = 120;

/** Tolerance around the body fontSize used when counting how many chars sit
 *  at the body font class. PDFs from LaTeX commonly drift by ±0.5pt between
 *  body lines (footnote refs, math runs) so a strict-equal would underflow
 *  the body-char count. ±5% covers the observed drift. */
const BODY_FONT_TOLERANCE = 0.05;

/** Max non-whitespace chars before a block is "long" — long blocks are body
 *  paragraphs even when their dominant fontSize lifts them off the median. */
const MAX_HEADING_CHARS = 100;
const COMPACT_LABEL_MAX_HEADING_CHARS = 4;
const TALL_SIDE_LABEL_MIN_HEIGHT_PT = 80;
const TALL_SIDE_LABEL_MAX_WIDTH_PT = 48;
const TALL_SIDE_LABEL_MIN_ASPECT = 4;

function isHeadingCandidateText(text: string): boolean {
  const trimmed = text.trim();
  if (!/[\p{L}\p{N}]/u.test(trimmed)) return false;
  if (/^[\p{N}\s.-]{1,12}$/u.test(trimmed)) return false;
  if (/^@[A-Za-z0-9_.-]{2,}$/u.test(trimmed)) return false;
  if (isReferenceMetadataText(trimmed)) return false;
  return !/^[•●◦▪■‣]\s*/u.test(trimmed);
}

function isReferenceMetadataText(text: string): boolean {
  return /\b(?:https?:\/\/|www\.|doi:|arxiv:)/iu.test(text) || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(text);
}

function isNumberedHeadingText(text: string): boolean {
  return /^\s*\d+(?:\.\d+)*\.?\s+\S/u.test(text);
}

function isTallNarrowSideLabel(block: LayoutBlock, lineCount: number): boolean {
  if (lineCount !== 1 || block.writingMode === 'vertical') return false;
  if (block.width > TALL_SIDE_LABEL_MAX_WIDTH_PT || block.height < TALL_SIDE_LABEL_MIN_HEIGHT_PT) return false;
  return block.height / Math.max(block.width, 1) >= TALL_SIDE_LABEL_MIN_ASPECT;
}

function isCompactDiagramLabelText(text: string, nonWsChars: number, ratio: number): boolean {
  if (ratio >= 1.25) return false;
  if (nonWsChars > COMPACT_LABEL_MAX_HEADING_CHARS) return false;
  const trimmed = text.trim();
  if (isNumberedHeadingText(trimmed)) return false;
  return !/\s/u.test(trimmed);
}

function isLikelyBodyFragmentForLevel3(text: string): boolean {
  const trimmed = text.trim();
  if (isNumberedHeadingText(trimmed)) return false;
  if (/^\p{Ll}/u.test(trimmed)) return true;
  if (/\bet al\./iu.test(trimmed)) return true;
  if (/[,;:]/u.test(trimmed)) return true;
  if (/[\p{L}\p{N}]-$/u.test(trimmed)) return true;
  if (/[.!?]$/u.test(trimmed)) return true;
  return trimmed.split(/\s+/u).filter(Boolean).length > 7;
}

function isTopTitleCandidate(block: LayoutBlock, ratio: number, lineCount: number, nonWsChars: number): boolean {
  if (ratio < 1.25) return false;
  if (block.y > TOP_TITLE_MAX_Y) return false;
  if (block.width < TOP_TITLE_MIN_WIDTH) return false;
  return lineCount > 1 || nonWsChars >= TOP_TITLE_MIN_CHARS;
}

function isPersonBylineText(text: string): boolean {
  const trimmed = text
    .trim()
    .replace(/[∗*†‡§¶]\d*/gu, '')
    .replace(/\b\d+\b/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  if (trimmed.length > 80) return false;
  if (/[0-9@{}[\]/\\:;,]/u.test(trimmed)) return false;
  const words = trimmed.split(/\s+/u).filter((word) => !/^(?:and|&)$/iu.test(word));
  if (words.length < 2 || words.length > 8) return false;
  return words.every((word) => /^[A-Z][\p{L}.'-]*$/u.test(word) || /^[A-Z]\.$/u.test(word));
}

function demoteTopBylineHeadings(blocks: LayoutBlock[]): void {
  const topTitle = blocks.find((b) => b.role === 'heading' && b.level === 1 && b.y <= TOP_TITLE_MAX_Y);
  if (!topTitle) return;
  const titleBottom = topTitle.y + topTitle.height;
  for (const b of blocks) {
    if (b.role !== 'heading') continue;
    if (b.y <= titleBottom || b.y > titleBottom + TOP_BYLINE_MAX_GAP) continue;
    if (!isPersonBylineText(b.text)) continue;
    b.role = undefined;
    b.level = undefined;
    b.roleConfidence = undefined;
  }
}

/**
 * Classify each block as a heading (with a tiered confidence `level`) or
 * leave it as body. Body fontSize is the char-weighted median of every
 * line's fontSize, so a short 24pt heading doesn't pull the median up
 * against a 12pt body.
 *
 * Three tiers, all driven by `ratio = block.lines[0].fontSize / bodyFs`:
 *   - level 1 (`ratio ≥ 1.40`, or top-of-page document titles in the
 *     `ratio ≥ 1.25` band): paper / page titles. The 1.40 band fires
 *     unconditionally so a one-block slide or poster keeps a recognisable title.
 *   - level 2 (`ratio ≥ 1.25`): preserves the legacy threshold for full-
 *     confidence headings, gated only by the page having enough body text
 *     to make "heading vs body" a meaningful distinction.
 *   - level 2 (`1.15 ≤ ratio < 1.25`): catches the LaTeX/arxiv pattern
 *     (`12pt heading / 10pt body = 1.20`). Requires short + standalone
 *     + locally larger than neighbours, because that band overlaps with
 *     ordinary body-fontSize jitter.
 *   - level 3 (`1.08 ≤ ratio < 1.15`): subsection candidates
 *     (ResNet-style `3.1.` at 10.96/9.96 ≈ 1.10). Strict gates: short,
 *     single-line, standalone, locally larger.
 *
 * Below `1.08` the signal collapses into body-text jitter and is left
 * unclassified.
 *
 * Mutates each qualifying block in place by setting `role = 'heading'`
 * and `level`. Blocks that don't qualify keep both fields undefined.
 */
function classifyHeadings(blocks: LayoutBlock[]): void {
  if (blocks.length === 0) return;
  const charWeighted: number[] = [];
  for (const b of blocks) {
    for (const line of b.lines) {
      const weight = Math.max(line.text.length, 1);
      for (let i = 0; i < weight; i++) charWeighted.push(line.fontSize);
    }
  }
  if (charWeighted.length === 0) return;
  const bodyFontSize = median(charWeighted);
  if (bodyFontSize <= 0) return;

  // How many chars sit at the body font class? Low-tier classification
  // (level 2 structural / level 3) requires "the page actually has body
  // text"; without that, fontSize differences are just typography.
  // Manual counter loop to avoid the intermediate array `filter().length`
  // would build — `charWeighted` carries one entry per character on the
  // page, so dense documents would allocate thousands of slots only to
  // discard them.
  let bodyChars = 0;
  for (const fs of charWeighted) {
    if (Math.abs(fs - bodyFontSize) / bodyFontSize <= BODY_FONT_TOLERANCE) {
      bodyChars++;
    }
  }
  const hasCredibleBody = bodyChars >= MIN_BODY_CHARS_FOR_LOW_TIER;

  // For the "standalone" / "locally larger" structural checks we need each
  // block's vertical neighbours. Pre-sort by y once so the per-block lookup
  // stays O(1).
  const byY = [...blocks].sort((a, b) => a.y - b.y);
  const yIndex = new Map<LayoutBlock, number>();
  for (let i = 0; i < byY.length; i++) yIndex.set(byY[i], i);

  // Dominant fontSize per block, char-weighted across the block's lines.
  // The "locally larger" check below compares against this rather than
  // `lines[0].fontSize` — a body paragraph that opens with inline math /
  // footnote ref / sub-superscript can have a noisy first-line fontSize
  // (e.g. 11.96pt run inside a 9.96pt body), which would otherwise let a
  // 10.96pt subheading look "not locally larger" than its body neighbour.
  const dominantFs = new Map<LayoutBlock, number>();
  for (const b of blocks) {
    const fontWeights: number[] = [];
    for (const line of b.lines) {
      const weight = Math.max(line.text.replace(/\s/g, '').length, 1);
      for (let i = 0; i < weight; i++) fontWeights.push(line.fontSize);
    }
    dominantFs.set(b, fontWeights.length > 0 ? median(fontWeights) : (b.lines[0]?.fontSize ?? bodyFontSize));
  }

  // Map a heading block's geometric features to a 0..1 confidence. Used
  // to populate `roleConfidence` whenever a block is classified — agents
  // that want a high-precision slice can threshold (e.g. `>= 0.7`) instead
  // of relying on the discrete `level`. The formula is intentionally
  // simple and inspectable: half the score comes from how far the
  // candidate's fontSize sits above body (saturating at ratio 1.5), the
  // other half from how many of the 4 structural gates passed (each
  // worth 0.125). See LayoutBlock.roleConfidence in types/index.ts for
  // the band guidance that surfaces in JSDoc.
  const computeRoleConfidence = (
    ratio: number,
    isShort: boolean,
    standalone: boolean,
    locallyLarger: boolean,
    singleLine: boolean,
  ): number => {
    const fontRatioScore = Math.max(0, Math.min(1, (ratio - 1.0) / 0.5));
    const passed = (isShort ? 1 : 0) + (standalone ? 1 : 0) + (locallyLarger ? 1 : 0) + (singleLine ? 1 : 0);
    return Math.round((0.5 * fontRatioScore + 0.125 * passed) * 100) / 100;
  };

  for (const b of blocks) {
    if (!isHeadingCandidateText(b.text)) continue;
    const repFont = b.lines[0]?.fontSize ?? bodyFontSize;
    const ratio = repFont / bodyFontSize;
    if (ratio < 1.08) continue;

    const nonWsChars = b.lines.reduce((acc, l) => acc + l.text.replace(/\s/g, '').length, 0);
    const isShort = nonWsChars <= MAX_HEADING_CHARS;
    const lineCount = b.lines.length;
    const topTitle = isTopTitleCandidate(b, ratio, lineCount, nonWsChars);
    if (isTallNarrowSideLabel(b, lineCount)) continue;
    if (isCompactDiagramLabelText(b.text, nonWsChars, ratio)) continue;

    // "Above" / "below" must be the candidate's same-column neighbours,
    // not just the y-adjacent blocks. On multi-column pages a subheading
    // in the left column has the right column's body sitting at the same
    // y; without an x-overlap filter, the structural checks compare against
    // the wrong neighbour and the gap reads as negative ("they overlap").
    const cx0 = b.x;
    const cx1 = b.x + b.width;
    const xOverlaps = (other: LayoutBlock): boolean => other.x < cx1 && other.x + other.width > cx0;
    const idx = yIndex.get(b) ?? 0;
    let above: LayoutBlock | undefined;
    for (let i = idx - 1; i >= 0; i--) {
      if (xOverlaps(byY[i])) {
        above = byY[i];
        break;
      }
    }
    let below: LayoutBlock | undefined;
    for (let i = idx + 1; i < byY.length; i++) {
      if (xOverlaps(byY[i])) {
        below = byY[i];
        break;
      }
    }
    // "Standalone" = visibly separated from both neighbours. Use the
    // candidate's own line height as the unit so a 24pt heading needs a
    // bigger gap than an 8pt footer to count.
    const halfLine = repFont * 0.5;
    const gapAbove = above ? b.y - (above.y + above.height) : Number.POSITIVE_INFINITY;
    const gapBelow = below ? below.y - (b.y + b.height) : Number.POSITIVE_INFINITY;
    const standalone = gapAbove >= halfLine && gapBelow >= halfLine;
    // "Locally larger" = bigger than the adjacent block's dominant fontSize
    // (not just its first line). Edge-of-page blocks (no neighbour) pass
    // trivially via Array.every on an empty array, no special-casing needed.
    const neighbours = [above, below].filter((n): n is LayoutBlock => n !== undefined);
    const locallyLarger = neighbours.every((n) => repFont > (dominantFs.get(n) ?? bodyFontSize));

    const singleLine = lineCount === 1;
    if (ratio >= 1.4) {
      // Level 1: titles. Always classify, even on poster/slide pages with
      // no body text — losing the title hurts more than a rare false
      // positive on a page that's nothing but a single big word.
      b.role = 'heading';
      b.level = 1;
      b.roleConfidence = computeRoleConfidence(ratio, isShort, standalone, locallyLarger, singleLine);
    } else if (ratio >= 1.25) {
      // Level 2 (legacy band). The historical 1.25× rule, kept intact
      // except for one new guard: if the page lacks a credible body, we
      // demote so a uniform-large page doesn't tag every block.
      if (!hasCredibleBody) continue;
      b.role = 'heading';
      b.level = topTitle ? 1 : 2;
      b.roleConfidence = computeRoleConfidence(ratio, isShort, standalone, locallyLarger, singleLine);
    } else if (ratio >= 1.15) {
      // Level 2 (structural band). Catches arxiv-style 12pt section
      // headings over 10pt body. Requires the page to have real body
      // text AND the block to look heading-shaped.
      if (!hasCredibleBody) continue;
      if (!isShort) continue;
      if (lineCount > 2) continue;
      if (!standalone && !locallyLarger) continue;
      b.role = 'heading';
      b.level = 2;
      b.roleConfidence = computeRoleConfidence(ratio, isShort, standalone, locallyLarger, singleLine);
    } else {
      // Level 3 (subsection band). Strict gates — short + single-line +
      // locally-larger-than-same-column-neighbours + credible body. The
      // gap-based "standalone" check is intentionally NOT required here:
      // on multi-column pages the body block's bbox spans the full page
      // width (union of left + right column lines), so gap-to-next-block
      // can read negative even when the actual same-column content is
      // far below. locallyLarger uses the neighbour's dominant fontSize,
      // which doesn't suffer from that geometry issue, and is strict
      // enough on its own to catch arxiv subsections (10.96/9.96 ≈ 1.10).
      if (!hasCredibleBody) continue;
      if (!isShort) continue;
      if (lineCount > 1) continue;
      if (!locallyLarger) continue;
      if (isLikelyBodyFragmentForLevel3(b.text)) continue;
      b.role = 'heading';
      b.level = 3;
      b.roleConfidence = computeRoleConfidence(ratio, isShort, standalone, locallyLarger, singleLine);
    }
  }
  demoteTopBylineHeadings(blocks);
}

/**
 * Detect a multi-column layout and reorder blocks into reading order.
 *
 * A naive top-down sort interleaves columns: line 1 of the left column,
 * then line 1 of the right column, then line 2 of the left, etc. — which
 * is unreadable for any agent that doesn't already know the page is
 * multi-column. Re-ordering by (column, y) preserves the intended flow.
 *
 * Detection is intentionally conservative — false-positive columns are
 * worse than missing them, since they scramble single-column documents:
 *
 *   1. Treat blocks wider than 60% of the page as `spanning` (likely
 *      page-spanning headings, footers). They keep their position in the
 *      y-ordered output and act as group separators.
 *   2. Cluster the remaining `narrow` blocks (including headings) by
 *      their left-edge x. Two blocks share a column when their x's are
 *      within 5% of the page width of each other.
 *   3. Promote standalone headings (a heading block with no parallel
 *      block in another column at a similar y) to spanning separators.
 *      This catches both shapes that would otherwise misorder a real
 *      page: a left-aligned section heading that joined the left
 *      column, and a centered heading that opened its own one-block
 *      cluster between the two real columns. Parallel-heading layouts
 *      (one heading per column at the same y) keep their column
 *      membership so the body underneath each heading reads with that
 *      column, not as a single "all headings then all bodies" flush.
 *   4. Reject if (after pruning promoted headings) there's only one
 *      surviving column, or any surviving column has < 2 blocks — a
 *      lone block sitting at a different x is just an indent, not a
 *      column.
 *   5. Walk the y-ordered blocks; whenever a run of narrow column
 *      blocks sits between two spanning blocks (or the page edge),
 *      reorder that run by (column index, y).
 */
function reorderForColumns(blocks: LayoutBlock[], pageWidth: number): LayoutBlock[] {
  if (blocks.length < 4 || pageWidth <= 0) return blocks;

  const spanThreshold = pageWidth * 0.6;
  const xEpsilon = pageWidth * 0.05;

  const narrow = blocks.filter((b) => b.width < spanThreshold && b.writingMode !== 'vertical');
  if (narrow.length < 4) return blocks;

  // Cluster narrow blocks by left edge x. Sorted ascending so each new
  // block joins the most recent column whose representative x is within
  // xEpsilon, otherwise opens a new column.
  const sortedByX = [...narrow].sort((a, b) => a.x - b.x);
  const initialColumns: LayoutBlock[][] = [[sortedByX[0]]];
  for (let i = 1; i < sortedByX.length; i++) {
    const last = initialColumns[initialColumns.length - 1];
    const colX = last[0].x;
    if (sortedByX[i].x - colX <= xEpsilon) {
      last.push(sortedByX[i]);
    } else {
      initialColumns.push([sortedByX[i]]);
    }
  }

  // Initial column-of-block map used by the standalone-heading test
  // below — even a singleton-x heading cluster gets a column index here,
  // so the parallelism check can compare its y against blocks in *other*
  // columns regardless of where the heading sat in x.
  const initialColumnOf = new Map<LayoutBlock, number>();
  for (let ci = 0; ci < initialColumns.length; ci++) {
    for (const b of initialColumns[ci]) initialColumnOf.set(b, ci);
  }

  // Promote standalone headings (heading blocks with no parallel block
  // in another column at a similar y) to separators *before* validating
  // column counts. Otherwise a centered standalone heading at a unique
  // x would form its own one-block cluster and trip the < 2 guard,
  // disabling reorder for the whole page.
  const hasParallelInOtherColumn = (heading: LayoutBlock): boolean => {
    const ownCol = initialColumnOf.get(heading);
    if (ownCol === undefined) return false;
    const yTop = heading.y;
    const yBot = heading.y + heading.height;
    for (const b of narrow) {
      if (b === heading) continue;
      const otherCol = initialColumnOf.get(b);
      if (otherCol === undefined || otherCol === ownCol) continue;
      const bTop = b.y;
      const bBot = b.y + b.height;
      if (bBot >= yTop && bTop <= yBot) return true;
    }
    return false;
  };
  // Only stronger headings act as column separators. Level 3 candidates
  // (subsections like "3.1.") are typically embedded inside a column;
  // promoting them would break two-column reading order by treating every
  // local subsection break as a page-wide flush. Numbered section headings
  // in papers are also commonly column-local (`1 Introduction` at the top
  // of the left column), so leave them in their column unless their width
  // already made them a normal spanning block.
  const promoted = new Set<LayoutBlock>();
  for (const b of narrow) {
    if (b.role === 'heading' && (b.level ?? 1) <= 2 && !hasParallelInOtherColumn(b) && !isNumberedHeadingText(b.text)) {
      promoted.add(b);
    }
  }

  // Surviving columns are the initial clusters minus promoted blocks.
  // Each surviving column needs ≥ 2 members and we need ≥ 2 surviving
  // columns; otherwise this isn't a real multi-column layout.
  const survivingColumns = initialColumns.map((c) => c.filter((b) => !promoted.has(b))).filter((c) => c.length >= 2);
  if (survivingColumns.length < 2) return blocks;

  const columnOf = new Map<LayoutBlock, number>();
  for (let ci = 0; ci < survivingColumns.length; ci++) {
    for (const b of survivingColumns[ci]) columnOf.set(b, ci);
  }

  // Walk in current (y-ordered) order. Buffer column-member blocks;
  // flush sorted by (column, y) whenever we hit a clearly-spanning
  // block or a promoted standalone heading.
  const out: LayoutBlock[] = [];
  let pending: LayoutBlock[] = [];
  const flush = () => {
    if (pending.length === 0) return;
    pending.sort((a, b) => {
      const ca = columnOf.get(a) ?? 0;
      const cb = columnOf.get(b) ?? 0;
      return ca - cb || a.y - b.y;
    });
    out.push(...pending);
    pending = [];
  };
  for (const b of blocks) {
    const isSeparator = !columnOf.has(b) || promoted.has(b);
    if (isSeparator) {
      flush();
      out.push(b);
    } else {
      pending.push(b);
    }
  }
  flush();
  return out;
}

function mergeAdjacentColumnBlocks(blocks: LayoutBlock[]): LayoutBlock[] {
  if (blocks.length < 2) return blocks;
  const out: LayoutBlock[] = [];
  for (const block of blocks) {
    const prev = out[out.length - 1];
    if (prev && canMergeAdjacentBodyBlocks(prev, block)) {
      prev.lines.push(...block.lines);
      prev.text = prev.lines.map((l) => l.text).join('\n');
      const box = unionBox(prev.lines);
      prev.x = box.x;
      prev.y = box.y;
      prev.width = box.width;
      prev.height = box.height;
    } else {
      out.push(block);
    }
  }
  return out;
}

function canMergeAdjacentBodyBlocks(a: LayoutBlock, b: LayoutBlock): boolean {
  if (a.role || b.role) return false;
  if (a.writingMode || b.writingMode) return false;
  const prevLine = a.lines.at(-1);
  const nextLine = b.lines[0];
  if (!prevLine || !nextLine) return false;

  const gap = b.y - (a.y + a.height);
  if (gap < -0.5 || gap > prevLine.height * 1.0) return false;

  const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  if (overlap <= 0) return false;

  const sizeRatio =
    Math.max(prevLine.fontSize, nextLine.fontSize) / Math.max(Math.min(prevLine.fontSize, nextLine.fontSize), 0.001);
  return sizeRatio <= 1.3;
}

function detectLayoutTables(lines: LayoutLine[]): LayoutTable[] | undefined {
  const allRowGroups = groupLinesByTableRow(lines).map((row) => row.sort((a, b) => a.x - b.x));
  const rowGroups = allRowGroups
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => isLikelyTableRow(row))
    .map(({ row, index }) => attachLabelContinuationRows(row, index, allRowGroups));
  if (rowGroups.length < 2) return undefined;

  const tables: LayoutLine[][][] = [];
  for (const row of rowGroups) {
    const prevTable = tables.at(-1);
    const prevRow = prevTable?.at(-1);
    if (prevRow && rowY(row) - rowBottom(prevRow) <= TABLE_GROUP_MAX_ROW_GAP_PT) {
      prevTable?.push(row);
    } else {
      tables.push([row]);
    }
  }

  const result = tables
    .filter((table) => table.length >= 2)
    .filter(hasRegularTableRowCadence)
    .map(toLayoutTable);
  return result.length > 0 ? result : undefined;
}

function groupLinesByTableRow(lines: LayoutLine[]): LayoutLine[][] {
  const rows: LayoutLine[][] = [];
  for (const line of [...lines].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find((candidate) => canShareTableRow(line, candidate[0]));
    if (row) row.push(line);
    else rows.push([line]);
  }
  return rows;
}

function isLikelyTableRow(row: LayoutLine[]): boolean {
  if (row.length < TABLE_ROW_MIN_CELLS) return false;
  const numericCells = row.filter((line) => isTableNumericCell(line.text)).length;
  return numericCells >= TABLE_ROW_MIN_NUMERIC_CELLS;
}

function attachLabelContinuationRows(row: LayoutLine[], rowIndex: number, allRows: LayoutLine[][]): LayoutLine[] {
  const label = row.find((line) => !isTableNumericCell(line.text) && /[\p{L}]/u.test(line.text));
  if (!label) return row;

  const continuations: LayoutLine[] = [];
  let previousBottom = label.y;
  for (let index = rowIndex - 1; index >= 0; index--) {
    const candidate = allRows[index];
    if (!isLabelContinuationRow(candidate, label, previousBottom)) break;
    continuations.unshift(mergeLineTexts(candidate));
    previousBottom = rowY(candidate);
  }
  if (continuations.length === 0) return row;

  const mergedLabel = mergeLineTexts([...continuations, label]);
  return row.map((line) => (line === label ? mergedLabel : line));
}

function isLabelContinuationRow(row: LayoutLine[], label: LayoutLine, nextTop: number): boolean {
  if (row.length === 0 || row.length > 2) return false;
  if (row.some((line) => isTableNumericCell(line.text))) return false;
  const merged = mergeLineTexts(row);
  if (merged.text.trim().endsWith(':')) return false;
  if (!/[\p{L}]/u.test(merged.text)) return false;
  if (Math.abs(merged.x - label.x) > Math.max(12, label.fontSize * 2)) return false;
  const gap = nextTop - (merged.y + merged.height);
  return gap >= -1 && gap <= Math.max(18, label.fontSize * 2.2);
}

function mergeLineTexts(lines: LayoutLine[]): LayoutLine {
  const sorted = [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
  const box = unionBox(sorted);
  return {
    text: sorted.map((line) => line.text).join(' '),
    ...box,
    fontSize: round2(mode(sorted.map((line) => line.fontSize))),
  };
}

function hasRegularTableRowCadence(rows: LayoutLine[][]): boolean {
  const gaps = rowGaps(rows);
  if (gaps.length < 2) return true;
  if (cadenceMatchRatio(gaps) >= TABLE_ROW_CADENCE_MIN_MATCH_RATIO) return true;
  return hasRecurringNumericColumns(rows);
}

function rowGaps(rows: LayoutLine[][]): number[] {
  const ys = rows.map(rowY).sort((a, b) => a - b);
  return ys
    .slice(1)
    .map((y, index) => y - ys[index])
    .filter((gap) => gap > 0.5);
}

function cadenceMatchRatio(gaps: number[]): number {
  if (gaps.length === 0) return 1;
  const median = medianNumber(gaps);
  const tolerance = Math.max(TABLE_ROW_CADENCE_MIN_TOLERANCE_PT, median * TABLE_ROW_CADENCE_TOLERANCE_RATIO);
  return gaps.filter((gap) => Math.abs(gap - median) <= tolerance).length / gaps.length;
}

function medianNumber(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function hasRecurringNumericColumns(rows: LayoutLine[][]): boolean {
  const minRows = Math.max(
    TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROWS,
    Math.ceil(rows.length * TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROW_RATIO),
  );
  if (rows.filter(hasTableLabelCell).length < minRows) return false;
  const columns: { right: number; rowIndexes: Set<number>; sampleCount: number }[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    for (const line of rows[rowIndex]) {
      if (!isTableNumericCell(line.text)) continue;
      const right = line.x + line.width;
      let column = columns.find(
        (candidate) => Math.abs(candidate.right - right) <= TABLE_RECURRING_NUMERIC_COLUMN_TOLERANCE_PT,
      );
      if (!column) {
        column = { right, rowIndexes: new Set(), sampleCount: 0 };
        columns.push(column);
      }
      column.right = (column.right * column.sampleCount + right) / (column.sampleCount + 1);
      column.sampleCount += 1;
      column.rowIndexes.add(rowIndex);
    }
  }
  return (
    columns.filter((column) => column.rowIndexes.size >= minRows).length >= TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS
  );
}

function hasTableLabelCell(row: LayoutLine[]): boolean {
  return row.some((line) => !isTableNumericCell(line.text) && /[\p{L}]/u.test(line.text));
}

function isTableNumericCell(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || !/\d/u.test(trimmed)) return false;
  return trimmed.replace(/[0-9.,()%$¥€£+\-\s]/gu, '').length === 0;
}

function gutterBin(prev: BBox, cur: BBox): number {
  const gap = cur.x - (prev.x + prev.width);
  const center = prev.x + prev.width + gap / 2;
  return Math.round(center / RECURRING_GUTTER_BIN_PT) * RECURRING_GUTTER_BIN_PT;
}

function isRecurringGutterCandidate(
  groupBox: BBox,
  prev: TextSpan,
  cur: TextSpan,
  gap: number,
  fontSize: number,
  pageWidth: number,
): boolean {
  if (pageWidth <= 0) return false;
  if (groupBox.width < pageWidth * RECURRING_GUTTER_WIDE_ROW_RATIO) return false;
  if (gap < Math.max(fontSize * RECURRING_GUTTER_GAP_RATIO, RECURRING_GUTTER_MIN_GAP_PT)) return false;

  const leftWidth = prev.x + prev.width - groupBox.x;
  const rightWidth = groupBox.x + groupBox.width - cur.x;
  return (
    leftWidth >= pageWidth * RECURRING_GUTTER_SIDE_MIN_RATIO &&
    rightWidth >= pageWidth * RECURRING_GUTTER_SIDE_MIN_RATIO
  );
}

function isRecurringGutterSplitCandidate(
  groupBox: BBox,
  prev: TextSpan,
  cur: TextSpan,
  gap: number,
  fontSize: number,
  pageWidth: number,
): boolean {
  if (pageWidth <= 0) return false;
  if (groupBox.width < pageWidth * 0.4) return false;
  if (gap < Math.max(fontSize * RECURRING_GUTTER_GAP_RATIO, RECURRING_GUTTER_MIN_GAP_PT)) return false;

  const leftWidth = prev.x + prev.width - groupBox.x;
  const rightWidth = groupBox.x + groupBox.width - cur.x;
  return (
    leftWidth >= pageWidth * RECURRING_GUTTER_SIDE_MIN_RATIO ||
    rightWidth >= pageWidth * RECURRING_GUTTER_SIDE_MIN_RATIO
  );
}

function detectRecurringGutterBins(lineGroups: TextSpan[][], pageWidth: number): Set<number> {
  if (pageWidth <= 0) return new Set();

  const counts = new Map<number, number>();
  for (const group of lineGroups) {
    if (group.length < 2) continue;
    const xSorted = [...group].sort((a, b) => a.x - b.x);
    const groupBox = unionBox(xSorted);
    const binsInRow = new Set<number>();
    for (let i = 1; i < xSorted.length; i++) {
      const prev = xSorted[i - 1];
      const cur = xSorted[i];
      const gap = cur.x - (prev.x + prev.width);
      const prevFontSize = prev.fontSize || FONT_SIZE_FALLBACK_PT;
      const curFontSize = cur.fontSize || FONT_SIZE_FALLBACK_PT;
      const fontSize = Math.min(prevFontSize, curFontSize);
      if (isRecurringGutterCandidate(groupBox, prev, cur, gap, fontSize, pageWidth)) {
        binsInRow.add(gutterBin(prev, cur));
      }
    }
    for (const bin of binsInRow) counts.set(bin, (counts.get(bin) ?? 0) + 1);
  }

  const recurring = new Set<number>();
  for (const [bin, count] of counts) {
    if (count >= RECURRING_GUTTER_MIN_ROWS) recurring.add(bin);
  }
  return recurring;
}

function detectRecurringTableGutterBins(lineGroups: TextSpan[][], pageWidth: number): Set<number> {
  if (pageWidth <= 0) return new Set();

  const counts = new Map<number, number>();
  for (const group of lineGroups) {
    const numericSpans = group.filter(isTableGutterNumericSpan);
    if (numericSpans.length < RECURRING_TABLE_GUTTER_MIN_NUMERIC_SPANS) continue;

    const xSorted = [...group].sort((a, b) => a.x - b.x);
    const groupBox = unionBox(xSorted);
    const binsInRow = new Set<number>();
    for (let i = 1; i < xSorted.length; i++) {
      const prev = xSorted[i - 1];
      const cur = xSorted[i];
      if (!isTableGutterNumericSpan(prev) || !isTableGutterNumericSpan(cur)) continue;
      const gap = cur.x - (prev.x + prev.width);
      const prevFontSize = prev.fontSize || FONT_SIZE_FALLBACK_PT;
      const curFontSize = cur.fontSize || FONT_SIZE_FALLBACK_PT;
      const fontSize = Math.min(prevFontSize, curFontSize);
      if (isRecurringTableGutterCandidate(groupBox, gap, fontSize, pageWidth)) {
        binsInRow.add(gutterBin(prev, cur));
      }
    }
    for (const bin of binsInRow) counts.set(bin, (counts.get(bin) ?? 0) + 1);
  }

  const recurring = new Set<number>();
  for (const [bin, count] of counts) {
    if (count >= RECURRING_TABLE_GUTTER_MIN_ROWS) recurring.add(bin);
  }
  return recurring;
}

function hasRecurringGutter(recurringGutterBins: Set<number>, prev: TextSpan, cur: TextSpan): boolean {
  if (recurringGutterBins.size === 0) return false;
  const bin = gutterBin(prev, cur);
  for (const recurringBin of recurringGutterBins) {
    if (Math.abs(recurringBin - bin) <= RECURRING_GUTTER_BIN_PT) return true;
  }
  return false;
}

function isRecurringTableGutterCandidate(groupBox: BBox, gap: number, fontSize: number, pageWidth: number): boolean {
  if (groupBox.width < pageWidth * 0.4) return false;
  return gap >= Math.max(fontSize * RECURRING_GUTTER_GAP_RATIO, RECURRING_GUTTER_MIN_GAP_PT);
}

function isTableGutterNumericSpan(span: TextSpan): boolean {
  return /^[\s0-9.,()%+-]+$/u.test(span.text);
}

function rowY(row: LayoutLine[]): number {
  return Math.min(...row.map((line) => line.y));
}

function rowBottom(row: LayoutLine[]): number {
  return Math.max(...row.map((line) => line.y + line.height));
}

function toLayoutTable(rows: LayoutLine[][]): LayoutTable {
  const cells = rows.flat();
  const box = unionBox(cells);
  const normalizedRows = rows.map(normalizeTableCurrencyCells);
  return {
    ...box,
    rowCount: rows.length,
    columnCount: Math.max(...normalizedRows.map((row) => row.length)),
    rows: normalizedRows.map((row, index) => ({
      y: round2(rowY(rows[index])),
      height: round2(rowBottom(rows[index]) - rowY(rows[index])),
      cells: row.map((cell) => ({
        text: cell.text,
        x: cell.x,
        y: cell.y,
        width: cell.width,
        height: cell.height,
      })),
    })),
  };
}

function normalizeTableCurrencyCells(row: LayoutLine[]): LayoutLine[] {
  const normalized: LayoutLine[] = [];
  let pendingCurrency: string | undefined;
  for (let i = 0; i < row.length; i++) {
    const cell = row[i];
    const text = cell.text.trim();
    if (isCurrencyOnlyCell(text) && isTableNumericCell(row[i + 1]?.text ?? '')) {
      pendingCurrency = text;
      continue;
    }

    const trailing = trailingCurrencyForNextValue(text, row[i + 1]);
    const textWithoutTrailing = trailing ? text.slice(0, -trailing.length).trimEnd() : text;
    const nextText = pendingCurrency ? `${pendingCurrency} ${textWithoutTrailing}` : textWithoutTrailing;
    normalized.push({ ...cell, text: nextText });
    pendingCurrency = trailing;
  }
  if (pendingCurrency) {
    normalized.push({
      text: pendingCurrency,
      x: row.at(-1)?.x ?? 0,
      y: rowY(row),
      width: 0,
      height: rowBottom(row) - rowY(row),
      fontSize: row.at(-1)?.fontSize ?? 0,
    });
  }
  return normalized;
}

function isCurrencyOnlyCell(text: string): boolean {
  return /^[$¥€£]$/u.test(text.trim());
}

function trailingCurrencyForNextValue(text: string, next: LayoutLine | undefined): string | undefined {
  if (!next || !isTableNumericCell(next.text)) return undefined;
  const match = /^(.+?)\s*([$¥€£])$/u.exec(text.trim());
  if (!match) return undefined;
  return isTableNumericCell(match[1]) ? match[2] : undefined;
}

/**
 * Group `spans` into lines (by y proximity) and lines into blocks (by
 * vertical-gap and font-size similarity), then classify headings and
 * reorder for multi-column layouts. Pure function — no side effects
 * beyond the returned structure.
 *
 * Heuristics, tuned against the colopl / golf / repomix-OSS fixtures:
 *
 *   - Same line: |y_a - y_b| < 0.5 × span height
 *   - New block: gap > 1.0 × prev line height OR fontSize ratio > 1.3
 *
 * `pageWidth` is needed for column detection; pass 0 to skip the multi-
 * column pass (e.g. when the caller already knows the page is single-
 * column or when blocks come from a non-page source).
 */
export function buildLayout(spans: TextSpan[], pageWidth = 0): PageLayout {
  if (spans.length === 0) return { blocks: [] };

  const vertical = extractVerticalCjkBlocks(spans);

  // Stable sort: primarily by y (top to bottom), then by x within a row.
  const sorted = [...vertical.remainingSpans].sort((a, b) => a.y - b.y || a.x - b.x);

  // Cluster spans into lines. The y comparison anchors on the first span
  // of the current group rather than the most recent one — chaining off
  // the latest span lets a slow vertical drift accumulate and merge spans
  // whose y is significantly above the line's actual baseline.
  const lineGroups: TextSpan[][] = [];
  for (const s of sorted) {
    const last = lineGroups[lineGroups.length - 1];
    if (last && canShareTextLine(s, lineGroupAnchor(last))) {
      last.push(s);
    } else {
      lineGroups.push([s]);
    }
  }

  // Split each y-row into runs of contiguous spans. An x-gap of
  // max(1.5×fontSize, 16pt) is a strong column/table gutter signal:
  // ordinary inter-word gaps are well under 1× fontSize, while narrow
  // three-column instruction pages can use only ~18pt between columns.
  // Some dense journals use ~12pt two-column gutters, too close to wide
  // justified word spaces to trust per-row. Those split only when the
  // same gutter position recurs on several page-wide y-rows.
  const recurringGutterBins = detectRecurringGutterBins(lineGroups, pageWidth);
  const recurringTableGutterBins = detectRecurringTableGutterBins(lineGroups, pageWidth);
  const lines: LayoutLine[] = lineGroups.flatMap((group) => {
    const xSorted = [...group].sort((a, b) => a.x - b.x);
    const groupBox = unionBox(xSorted);
    const subLines: TextSpan[][] = [[xSorted[0]]];
    for (let i = 1; i < xSorted.length; i++) {
      const prev = xSorted[i - 1];
      const cur = xSorted[i];
      const gap = cur.x - (prev.x + prev.width);
      // Same broken-PDF guard as joinLineSpans: fontSize=0 on both
      // sides would turn this into `gap > 0` and split every span into
      // its own subLine.
      const prevFontSize = prev.fontSize || FONT_SIZE_FALLBACK_PT;
      const curFontSize = cur.fontSize || FONT_SIZE_FALLBACK_PT;
      const fontSize = Math.min(prevFontSize, curFontSize);
      const segmentGap = Math.max(fontSize * LAYOUT_SEGMENT_GAP_RATIO, LAYOUT_SEGMENT_MIN_GAP_PT);
      const recurringGutter =
        hasRecurringGutter(recurringGutterBins, prev, cur) &&
        isRecurringGutterSplitCandidate(groupBox, prev, cur, gap, fontSize, pageWidth);
      const recurringTableGutter =
        hasRecurringGutter(recurringTableGutterBins, prev, cur) &&
        isTableGutterNumericSpan(prev) &&
        isTableGutterNumericSpan(cur) &&
        isRecurringTableGutterCandidate(groupBox, gap, fontSize, pageWidth);
      if (gap > segmentGap || recurringGutter || recurringTableGutter) {
        subLines.push([cur]);
      } else {
        subLines[subLines.length - 1].push(cur);
      }
    }
    return subLines.map((sub) => ({
      text: joinLineSpans(sub),
      ...unionBox(sub),
      fontSize: round2(mode(sub.map((s) => s.fontSize))),
    }));
  });
  const tables = detectLayoutTables(lines);

  // Cluster lines into blocks. Splits when:
  //   - vertical gap > 1× prev line height (paragraph break / section break)
  //   - fontSize ratio > 1.3 (heading vs body)
  //   - lines are side-by-side rather than stacked (x-disjoint and y-
  //     overlapping). Two column lines at the same y get y-clustered into
  //     adjacent layout lines but must not share a block, otherwise the
  //     left and right columns merge into one nonsense block.
  const blockGroups: LayoutLine[][] = [];
  for (const line of lines) {
    const last = blockGroups[blockGroups.length - 1];
    if (last) {
      const prev = last[last.length - 1];
      const gap = line.y - (prev.y + prev.height);
      const sizeRatio =
        Math.max(line.fontSize, prev.fontSize) / Math.max(Math.min(line.fontSize, prev.fontSize), 0.001);
      const xDisjoint = line.x + line.width <= prev.x || prev.x + prev.width <= line.x;
      const sideBySide = gap < 0 && xDisjoint;
      // Multi-column pages often emit the right-column line for row N,
      // then the left-column line for row N+1. They do not vertically
      // overlap, so `sideBySide` misses them and the old clustering glued
      // different columns into one block. If two close lines have no
      // horizontal overlap at all, keep them as separate visual blocks.
      const closeButDifferentColumn = xDisjoint && Math.abs(gap) <= prev.height * 1.5;
      // Narrow heading-glue split: when the previous line is short and
      // at a noticeably larger fontSize than the incoming line, treat
      // the run that ends at `prev` as a (sub)heading that mustn't merge
      // with the body below. The general 1.3× ratio rule above would miss
      // arxiv subsections (10.96 over 9.96 ≈ 1.10×); this rule fires only
      // at 1.05× and only with the heading-shaped guards, so it doesn't
      // over-split emphasis runs inside paragraphs. We deliberately do
      // not gate on `last.length === 1` — level 2 structural headings can
      // legitimately span two lines (see the LEVEL_2_MAX_LINES path), so
      // a 2-line heading whose second line is short + larger than the
      // body still needs to break here.
      const prevWasShortLarger =
        prev.fontSize > line.fontSize * 1.05 && prev.text.replace(/\s/g, '').length <= MAX_HEADING_CHARS;
      if (gap > prev.height * 1.0 || sizeRatio > 1.3 || sideBySide || closeButDifferentColumn || prevWasShortLarger) {
        blockGroups.push([line]);
      } else {
        last.push(line);
      }
    } else {
      blockGroups.push([line]);
    }
  }

  const blocks: LayoutBlock[] = [
    ...blockGroups.map((group) => ({
      text: group.map((l) => l.text).join('\n'),
      ...unionBox(group),
      lines: group,
    })),
    ...vertical.blocks,
  ].sort((a, b) => a.y - b.y || a.x - b.x);

  classifyHeadings(blocks);
  const ordered = pageWidth > 0 ? reorderForColumns(blocks, pageWidth) : blocks;
  if (ordered !== blocks)
    return { blocks: mergeAdjacentColumnBlocks(ordered), ...(tables !== undefined && { tables }) };

  return { blocks: ordered, ...(tables !== undefined && { tables }) };
}

/**
 * Cross-page pass: flag blocks that look like running headers / footers /
 * page numbers / watermarks. Two blocks across different pages are
 * considered the "same" when their normalized text matches and their top y
 * sits in the same 5-pt bin (page chrome rarely shifts more than that
 * between pages, while body text reflows). Edge-band blocks also contribute
 * long line-level keys so a stable footer line still marks its parent block
 * as repeated when an adjacent page-number line changes on every page.
 * Numeric variants like "Lecture 5 - 18" also contribute a digit-normalized
 * key, but only inside the page edge band.
 *
 * A block is marked `repeated: true` when it occurs on at least 2 pages
 * AND on at least half of the pages that have a layout. With the default
 * threshold a 3-page run with the same footer marks all three; a one-off
 * line that happens to coincide with one other page does not.
 *
 * Mutates the layout in place.
 */
export function markRepeatedBlocks(pages: PageResult[]): void {
  const pagesWithLayout = pages.filter((p) => p.layout && p.layout.blocks.length > 0);
  if (pagesWithLayout.length < 2) return;

  type BlockRef = { pageIndex: number; blockIndex: number };
  const groups = new Map<string, BlockRef[]>();
  for (let pi = 0; pi < pagesWithLayout.length; pi++) {
    const page = pagesWithLayout[pi];
    const blocks = page.layout?.blocks ?? [];
    for (let bi = 0; bi < blocks.length; bi++) {
      const b = blocks[bi];
      if (!isRepeatedChromeCandidate(page, b)) continue;
      const text = b.text.replace(/\s+/g, ' ').trim();
      for (const keyText of repeatedChromeTextKeys(text, isDigitVariableChromeCandidate(page, b, text))) {
        addRepeatedChromeGroup(groups, `block\t${Math.round(b.y / 5) * 5}\t${keyText}`, {
          pageIndex: pi,
          blockIndex: bi,
        });
      }
      for (const line of b.lines) {
        if (!isRepeatedChromeLineCandidate(page, line)) continue;
        const lineText = line.text.replace(/\s+/g, ' ').trim();
        for (const keyText of repeatedChromeTextKeys(lineText, isDigitVariableChromeCandidate(page, line, lineText))) {
          addRepeatedChromeGroup(groups, `line\t${Math.round(line.y / 5) * 5}\t${keyText}`, {
            pageIndex: pi,
            blockIndex: bi,
          });
        }
      }
    }
  }

  const minOccurrences = Math.max(2, Math.ceil(pagesWithLayout.length / 2));
  for (const refs of groups.values()) {
    if (refs.length < minOccurrences) continue;
    const seenPages = new Set(refs.map((r) => r.pageIndex));
    if (seenPages.size < minOccurrences) continue;
    for (const ref of refs) {
      const block = pagesWithLayout[ref.pageIndex].layout?.blocks[ref.blockIndex];
      if (!block) continue;
      block.repeated = true;
      // Demote chrome from heading. A running header / page-number /
      // language-marker line that happens to be short and slightly
      // larger than the body fontSize sails through the heading
      // classifier (eu-ai-act surfaces "EN" as a level-1 heading on
      // every page). Once we know the block is repeated chrome, the
      // heading role is almost always wrong — and agents iterating
      // `headings` then see "EN" once per page. Drop the role here.
      // Consumers that genuinely want repeated headings (a doc title
      // that only appears in the running header) can still recover it
      // from `text` + `repeated: true` + size; the common case wins.
      if (block.role === 'heading') {
        block.role = undefined;
        block.level = undefined;
        block.roleConfidence = undefined;
      }
    }
  }
}

function addRepeatedChromeGroup(
  groups: Map<string, { pageIndex: number; blockIndex: number }[]>,
  key: string,
  ref: { pageIndex: number; blockIndex: number },
): void {
  const list = groups.get(key);
  if (list) list.push(ref);
  else groups.set(key, [ref]);
}

function repeatedChromeTextKeys(text: string, includeDigitNormalized: boolean): string[] {
  if (text.length === 0) return [];
  const keys = [text];
  const variable = includeDigitNormalized ? digitNormalizedChromeText(text) : undefined;
  if (variable && variable !== text) keys.push(variable);
  return keys;
}

function isDigitVariableChromeCandidate(page: PageResult, box: BBox, text: string): boolean {
  if (text.length > 80) return false;
  if (/^[\p{N}\s.-]{1,12}$/u.test(text) && box.width <= page.width * 0.12) return true;
  if (/^(?:page|p\.|slide|lecture)\b/iu.test(text)) return true;
  return box.width <= page.width * 0.25 && /\b(?:page|p\.|slide|lecture)\b/iu.test(text);
}

function digitNormalizedChromeText(text: string): string | undefined {
  if (!/\p{N}/u.test(text)) return undefined;
  const compactDigitLabel = text.replace(/\s+/g, '');
  if (/\s/u.test(text) && /^\p{N}{2,4}$/u.test(compactDigitLabel)) return '#page-number';
  if (!/\p{L}/u.test(text)) return undefined;
  const letterCount = [...text.matchAll(/\p{L}/gu)].length;
  if (letterCount < 4) return undefined;
  return text.replace(/\p{N}+/gu, '#');
}

function isRepeatedChromeCandidate(page: PageResult, block: LayoutBlock): boolean {
  const edgeBand = Math.max(REPEATED_CHROME_MIN_EDGE_PT, page.height * REPEATED_CHROME_EDGE_RATIO);
  return block.y <= edgeBand || block.y + block.height >= page.height - edgeBand;
}

function isRepeatedChromeLineCandidate(page: PageResult, line: LayoutBlock['lines'][number]): boolean {
  const text = line.text.replace(/\s+/g, ' ').trim();
  return (
    text.length >= REPEATED_CHROME_LINE_MIN_TEXT_LENGTH ||
    line.width >= page.width * REPEATED_CHROME_LINE_MIN_WIDTH_RATIO
  );
}

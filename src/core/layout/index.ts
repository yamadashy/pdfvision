import type { LayoutBlock, LayoutLine, PageLayout, TextSpan } from '../../types/index.js';
import { CJK_TIGHT_GAP_RATIO, isCjkLeading } from '../text/cjkJoin.js';
import { isStandaloneNumericLineAfterProse, mergeAdjacentColumnBlocks, reorderForColumns } from './columns.js';
import { type BBox, median, mode, round2, unionBox } from './geometry.js';
import {
  detectRecurringGutterBins,
  detectRecurringSidePanelStartBins,
  detectRecurringTableGutterBins,
  hasRecurringGutter,
  hasRecurringSidePanelStart,
  isRecurringGutterSplitCandidate,
  isRecurringSidePanelStartCandidate,
  isRecurringTableGutterCandidate,
  isTableGutterNumericSpan,
} from './gutters.js';
import { classifyHeadings } from './headings.js';
import { detectLayoutTables } from './tables.js';
import { compareLayoutBlocks, extractVerticalCjkBlocks, hasVerticalTextShape } from './verticalText.js';

export { markRepeatedBlocks } from './repeatedChrome.js';

import {
  isLikelyCjkDisplaySpacingRow,
  isLikelyWideWordSpacingRow,
  shouldInsertSemanticSpace,
} from '../text/spacing.js';
import { isRtlDominantPositionedText, textOrder } from '../text/textDirection.js';

/** Gap fraction for non-CJK pairs — pdf.js typically packs inter-word
 *  spaces around 0.22 × fontSize. Preserves the pre-fix behavior for
 *  Latin / digits / punctuation. CJK pairs use {@link CJK_TIGHT_GAP_RATIO}
 *  imported from cjkJoin so primary text and layout-block text classify
 *  the same gap identically. */
const DEFAULT_SPACE_GAP_RATIO = 0.22;

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
const LINE_TOP_ALIGNMENT_RATIO = 0.5;
const LINE_VERTICAL_OVERLAP_RATIO = 0.35;
const TINY_LINE_FONT_SIZE_PT = 4;
const TINY_LINE_LARGE_PEER_MIN_FONT_SIZE_PT = 8;
const TINY_LINE_MAX_FONT_RATIO = 0.55;
const TINY_LINE_MIN_CHARS = 8;
const SMALL_PUNCTUATION_LINE_FONT_SIZE_PT = 7;
const SMALL_PUNCTUATION_LINE_LARGE_PEER_MIN_FONT_SIZE_PT = 10;
const SMALL_PUNCTUATION_LINE_MAX_FONT_RATIO = 0.65;
const SHORT_LARGER_LINE_MAX_CHARS = 100;
const LINE_OVERLAP_MAX_HORIZONTAL_GAP_RATIO = 2;
const LINE_OVERLAP_MAX_HORIZONTAL_GAP_PT = 24;

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
function joinLineSpans(spans: TextSpan[]): string {
  if (spans.length === 0) return '';
  const rtl = isRtlDominantPositionedText(spans);
  const ordered = textOrder(spans);
  let out = ordered[0].text;
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    const gap = rtl ? prev.x - (cur.x + cur.width) : cur.x - (prev.x + prev.width);
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

function canShareLine(a: TextSpan, b: TextSpan): boolean {
  return hasVerticalTextShape(a) === hasVerticalTextShape(b);
}

function canShareTextLine(a: TextSpan, b: TextSpan): boolean {
  if (!canShareLine(a, b)) return false;
  if (hasVerticalTextShape(a) || hasVerticalTextShape(b)) {
    const minHeight = Math.max(Math.min(a.height, b.height), 1);
    if (Math.abs(a.y - b.y) < minHeight * LINE_TOP_ALIGNMENT_RATIO) return true;
    if (isLongNonCjkVerticalShapeSpan(a) && isLongNonCjkVerticalShapeSpan(b)) return false;
    if (!hasCloseHorizontalLineGap(a, b)) return false;
    const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return overlap >= minHeight * LINE_VERTICAL_OVERLAP_RATIO;
  }

  if (hasTinyLineFontMismatch(a, b)) return false;

  const aHeight = horizontalLineGroupingHeight(a);
  const bHeight = horizontalLineGroupingHeight(b);
  const minHeight = Math.max(Math.min(aHeight, bHeight), 1);
  if (Math.abs(a.y - b.y) < minHeight * LINE_TOP_ALIGNMENT_RATIO) return true;
  if (hasMisalignedLargeFontLine(a, b)) return false;
  if (!hasCloseHorizontalLineGap(a, b)) return false;
  const overlap = Math.min(a.y + aHeight, b.y + bHeight) - Math.max(a.y, b.y);
  return overlap >= minHeight * LINE_VERTICAL_OVERLAP_RATIO;
}

function isLongNonCjkVerticalShapeSpan(span: TextSpan): boolean {
  const trimmed = span.text.trim();
  return trimmed.length > 8 && !isCjkLeading(trimmed) && hasVerticalTextShape(span);
}

function hasTinyLineFontMismatch(a: TextSpan, b: TextSpan): boolean {
  const aFontSize = measuredLineFontSize(a);
  const bFontSize = measuredLineFontSize(b);
  if (aFontSize <= 0 || bFontSize <= 0) return false;

  const small = aFontSize <= bFontSize ? a : b;
  const smallFontSize = Math.min(aFontSize, bFontSize);
  const largeFontSize = Math.max(aFontSize, bFontSize);
  if (
    smallFontSize <= SMALL_PUNCTUATION_LINE_FONT_SIZE_PT &&
    largeFontSize >= SMALL_PUNCTUATION_LINE_LARGE_PEER_MIN_FONT_SIZE_PT &&
    smallFontSize / largeFontSize <= SMALL_PUNCTUATION_LINE_MAX_FONT_RATIO &&
    /^[\p{P}\p{S}]{1,3}$/u.test(small.text.trim())
  ) {
    return true;
  }
  if (smallFontSize > TINY_LINE_FONT_SIZE_PT) return false;
  if (largeFontSize < TINY_LINE_LARGE_PEER_MIN_FONT_SIZE_PT) return false;
  if (smallFontSize / largeFontSize > TINY_LINE_MAX_FONT_RATIO) return false;

  const smallChars = small.text.replace(/\s/g, '').length;
  return smallChars >= TINY_LINE_MIN_CHARS || small.width >= largeFontSize * 3;
}

function hasMisalignedLargeFontLine(a: TextSpan, b: TextSpan): boolean {
  const aFontSize = measuredLineFontSize(a);
  const bFontSize = measuredLineFontSize(b);
  if (aFontSize <= 0 || bFontSize <= 0) return false;

  const large = aFontSize >= bFontSize ? a : b;
  const largeFontSize = Math.max(aFontSize, bFontSize);
  const smallFontSize = Math.min(aFontSize, bFontSize);
  if (largeFontSize / smallFontSize < 1.25) return false;

  const largeChars = large.text.replace(/\s/g, '').length;
  if (largeChars <= 2) return false;
  if (!/\p{L}/u.test(large.text) && /\d/u.test(large.text)) return false;
  return /[\p{L}\p{N}]/u.test(large.text);
}

function measuredLineFontSize(span: TextSpan): number {
  if (span.fontSize > 0) return span.fontSize;
  if (span.height > 0) return span.height;
  return 0;
}

function hasCloseHorizontalLineGap(a: TextSpan, b: TextSpan): boolean {
  const gap = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
  if (gap <= 0) return true;
  const fontSize = Math.max(a.fontSize || FONT_SIZE_FALLBACK_PT, b.fontSize || FONT_SIZE_FALLBACK_PT);
  return gap <= Math.max(fontSize * LINE_OVERLAP_MAX_HORIZONTAL_GAP_RATIO, LINE_OVERLAP_MAX_HORIZONTAL_GAP_PT);
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

function isMisalignedLeftSidePanelBoundaryCandidate(
  groupBox: BBox,
  prev: TextSpan,
  cur: TextSpan,
  gap: number,
  fontSize: number,
  pageWidth: number,
): boolean {
  if (pageWidth <= 0) return false;
  const minHeight = Math.max(Math.min(horizontalLineGroupingHeight(prev), horizontalLineGroupingHeight(cur)), 1);
  const curStartsFormRow = /^\d+[a-z]?$/iu.test(cur.text.trim());
  if (Math.abs(prev.y - cur.y) < minHeight * LINE_TOP_ALIGNMENT_RATIO && !curStartsFormRow) return false;
  if (cur.x < pageWidth * 0.12 || cur.x > pageWidth * 0.3) return false;
  if (groupBox.width < pageWidth * 0.45) return false;
  if (gap < Math.max(fontSize * 0.75, 6)) return false;

  const leftWidth = prev.x + prev.width - groupBox.x;
  const rightWidth = groupBox.x + groupBox.width - cur.x;
  return leftWidth >= 40 && leftWidth <= pageWidth * 0.22 && rightWidth >= pageWidth * 0.3;
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
 * column or when blocks come from a non-page source). `pageHeight`
 * enables bottom-note detection inside column runs; 0 keeps the legacy
 * column sort for synthetic callers that do not know page bounds.
 */
export function buildLayout(spans: TextSpan[], pageWidth = 0, pageHeight = 0): PageLayout {
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
  const recurringSidePanelStartBins = detectRecurringSidePanelStartBins(lineGroups, pageWidth);
  const recurringTableGutterBins = detectRecurringTableGutterBins(lineGroups, pageWidth);
  const lines: LayoutLine[] = lineGroups.flatMap((group) => {
    const xSorted = [...group].sort((a, b) => a.x - b.x);
    const groupBox = unionBox(xSorted);
    const preserveWideWordSpacing = isLikelyWideWordSpacingRow(xSorted, pageWidth);
    const preserveCjkDisplaySpacing = isLikelyCjkDisplaySpacingRow(xSorted);
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
      const recurringSidePanelStart =
        hasRecurringSidePanelStart(recurringSidePanelStartBins, cur) &&
        isRecurringSidePanelStartCandidate(groupBox, prev, cur, gap, fontSize, pageWidth);
      const recurringTableGutter =
        hasRecurringGutter(recurringTableGutterBins, prev, cur) &&
        isTableGutterNumericSpan(prev) &&
        isTableGutterNumericSpan(cur) &&
        isRecurringTableGutterCandidate(groupBox, gap, fontSize, pageWidth);
      const misalignedLeftSidePanelBoundary = isMisalignedLeftSidePanelBoundaryCandidate(
        groupBox,
        prev,
        cur,
        gap,
        fontSize,
        pageWidth,
      );
      if (
        !preserveWideWordSpacing &&
        !preserveCjkDisplaySpacing &&
        (gap > segmentGap ||
          recurringGutter ||
          recurringSidePanelStart ||
          recurringTableGutter ||
          misalignedLeftSidePanelBoundary)
      ) {
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
        prev.fontSize > line.fontSize * 1.05 && prev.text.replace(/\s/g, '').length <= SHORT_LARGER_LINE_MAX_CHARS;
      const standaloneNumericAfterProse = isStandaloneNumericLineAfterProse(prev, line, pageWidth);
      if (
        gap > prev.height * 1.0 ||
        sizeRatio > 1.3 ||
        sideBySide ||
        closeButDifferentColumn ||
        prevWasShortLarger ||
        standaloneNumericAfterProse
      ) {
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
  ].sort(compareLayoutBlocks);

  classifyHeadings(blocks, pageWidth, pageHeight);
  const ordered = pageWidth > 0 ? reorderForColumns(blocks, pageWidth, pageHeight) : blocks;
  if (ordered !== blocks)
    return { blocks: mergeAdjacentColumnBlocks(ordered, pageWidth), ...(tables !== undefined && { tables }) };

  return { blocks: ordered, ...(tables !== undefined && { tables }) };
}

import type { LayoutBlock, LayoutLine, LayoutTable, PageLayout, TextSpan } from '../../types/index.js';
import { CJK_TIGHT_GAP_RATIO, isCjkLeading } from '../text/cjkJoin.js';
import { isStandaloneNumericLineAfterProse, mergeAdjacentColumnBlocks, reorderForColumns } from './columns.js';
import { type BBox, median, mode, round2, unionBox } from './geometry.js';
import { classifyHeadings } from './headings.js';

export { markRepeatedBlocks } from './repeatedChrome.js';

import {
  isLikelyCjkDisplaySpacingRow,
  isLikelyWideWordSpacingRow,
  shouldInsertSemanticSpace,
} from '../text/spacing.js';
import { isRtlDominantPositionedText, textOrder } from '../text/textDirection.js';

interface IndexedLayoutRow {
  row: LayoutLine[];
  index: number;
}

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
const RECURRING_GUTTER_GAP_RATIO = 1.05;
const RECURRING_GUTTER_MIN_GAP_PT = 9;
const RECURRING_GUTTER_WIDE_ROW_RATIO = 0.6;
const RECURRING_GUTTER_SIDE_MIN_RATIO = 0.25;
const RECURRING_GUTTER_BIN_PT = 5;
const RECURRING_GUTTER_MIN_ROWS = 3;
const RECURRING_SIDE_PANEL_START_RATIO = 0.58;
const RECURRING_SIDE_PANEL_ROW_MIN_WIDTH_RATIO = 0.6;
const RECURRING_SIDE_PANEL_LEFT_MIN_RATIO = 0.4;
const RECURRING_SIDE_PANEL_GAP_RATIO = 0.9;
const RECURRING_SIDE_PANEL_MIN_GAP_PT = 9;
const RECURRING_SIDE_PANEL_MIN_ROWS = 2;
const RECURRING_TABLE_GUTTER_MIN_ROWS = 4;
const RECURRING_TABLE_GUTTER_MIN_NUMERIC_SPANS = 3;
const RECURRING_TABLE_GUTTER_MIN_WIDTH_PT = 96;
const LINE_TOP_ALIGNMENT_RATIO = 0.5;
const LINE_VERTICAL_OVERLAP_RATIO = 0.35;
const TINY_LINE_FONT_SIZE_PT = 4;
const TINY_LINE_LARGE_PEER_MIN_FONT_SIZE_PT = 8;
const TINY_LINE_MAX_FONT_RATIO = 0.55;
const TINY_LINE_MIN_CHARS = 8;
const SMALL_PUNCTUATION_LINE_FONT_SIZE_PT = 7;
const SMALL_PUNCTUATION_LINE_LARGE_PEER_MIN_FONT_SIZE_PT = 10;
const SMALL_PUNCTUATION_LINE_MAX_FONT_RATIO = 0.65;
const TABLE_ROW_MIN_CELLS = 3;
const TABLE_ROW_MIN_NUMERIC_CELLS = 2;
const TWO_COLUMN_NUMERIC_TABLE_MIN_ROWS = 4;
const DECORATIVE_DOTTED_RULE_MIN_DOTS = 8;
const TABLE_GROUP_MAX_ROW_GAP_PT = 48;
const TABLE_ROW_CADENCE_MIN_MATCH_RATIO = 0.65;
const TABLE_ROW_CADENCE_TOLERANCE_RATIO = 0.25;
const TABLE_ROW_CADENCE_MIN_TOLERANCE_PT = 2;
const TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROWS = 4;
const TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS = 3;
const TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROW_RATIO = 0.6;
const TABLE_RECURRING_NUMERIC_COLUMN_TOLERANCE_PT = 10;
const TABLE_LEADING_ROW_MAX_GAP_PT = 24;
const TABLE_LEADING_ROW_MAX_OVERLAP_PT = 4;
const TABLE_LEADING_ROW_X_TOLERANCE_PT = 14;
const TABLE_LEADING_HEADER_MAX_CHARS = 80;
const TABLE_LEADING_HEADER_MAX_WORDS = 6;
const TABLE_LEADING_HEADER_MAX_WIDTH_PT = 180;
const SHORT_LARGER_LINE_MAX_CHARS = 100;
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

function extractVerticalCjkBlocks(spans: readonly TextSpan[]): {
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

function canShareLine(a: TextSpan, b: TextSpan): boolean {
  return hasVerticalTextShape(a) === hasVerticalTextShape(b);
}

function compareLayoutBlocks(a: LayoutBlock, b: LayoutBlock): number {
  if (a.writingMode === 'vertical' && b.writingMode === 'vertical' && verticalBlocksShareReadingBand(a, b)) {
    return b.x - a.x || a.y - b.y;
  }
  return a.y - b.y || a.x - b.x;
}

function verticalBlocksShareReadingBand(a: LayoutBlock, b: LayoutBlock): boolean {
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const minHeight = Math.max(Math.min(a.height, b.height), 1);
  return overlap / minHeight >= LINE_VERTICAL_OVERLAP_RATIO;
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

function canShareTableRow(a: LayoutLine, b: LayoutLine): boolean {
  const minHeight = Math.max(Math.min(a.height, b.height), 1);
  if (Math.abs(a.y - b.y) < minHeight * LINE_TOP_ALIGNMENT_RATIO) return true;
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlap >= minHeight * LINE_VERTICAL_OVERLAP_RATIO;
}

function detectLayoutTables(lines: LayoutLine[]): LayoutTable[] | undefined {
  const tableLines = lines.filter((line) => !isDecorativeDottedRuleLine(line));
  const allRowGroups = groupLinesByTableRow(tableLines).map((row) => row.sort((a, b) => a.x - b.x));
  const rowGroups: IndexedLayoutRow[] = allRowGroups
    .map((row, index) => ({ row: tableCandidateRow(row), index }))
    .filter((item): item is IndexedLayoutRow => item.row !== undefined)
    .map(({ row, index }) => ({ row: attachLabelContinuationRows(row, index, allRowGroups), index }));
  if (rowGroups.length < 2) return undefined;

  const tables: IndexedLayoutRow[][] = [];
  for (const row of rowGroups) {
    const prevTable = tables.at(-1);
    const prevRow = prevTable?.at(-1);
    if (prevRow && rowY(row.row) - rowBottom(prevRow.row) <= TABLE_GROUP_MAX_ROW_GAP_PT) {
      prevTable?.push(row);
    } else {
      tables.push([row]);
    }
  }

  const result: LayoutTable[] = [];
  for (let index = 0; index < tables.length; index++) {
    const table = tables[index];
    const baseRows = table.map(({ row }) => row);
    if (baseRows.length < 2 || !hasRegularTableRowCadence(baseRows)) continue;
    if (isTwoColumnNumericOnlyTable(baseRows) && baseRows.length < TWO_COLUMN_NUMERIC_TABLE_MIN_ROWS) continue;
    const nextTableFirstIndex = tables[index + 1]?.[0]?.index ?? allRowGroups.length;
    const rows = attachNumericContinuationRows(table, allRowGroups, nextTableFirstIndex);
    result.push(toLayoutTable(attachLeadingTableRows(rows, table[0]?.index ?? 0, allRowGroups)));
  }
  return result.length > 0 ? result : undefined;
}

const TABLE_SIDE_PANEL_MIN_GAP_PT = 40;
const TABLE_COMPACT_LABEL_MAX_WIDTH_PT = 140;
const TABLE_COMPACT_LABEL_MAX_CHARS = 60;

function groupLinesByTableRow(lines: LayoutLine[]): LayoutLine[][] {
  const rows: LayoutLine[][] = [];
  for (const line of [...lines].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find((candidate) => canShareTableRow(line, candidate[0]));
    if (row) row.push(line);
    else rows.push([line]);
  }
  return rows;
}

function isDecorativeDottedRuleLine(line: LayoutLine): boolean {
  const compact = line.text.replace(/\s+/g, '');
  if (compact.length < DECORATIVE_DOTTED_RULE_MIN_DOTS) return false;
  return /^[.\u00b7\u2022\u2027\u2219]+$/u.test(compact);
}

function tableCandidateRow(row: LayoutLine[]): LayoutLine[] | undefined {
  if (!isLikelyTableRow(row)) return undefined;
  for (let start = 1; start < row.length; start++) {
    const suffix = row.slice(start);
    if (!isLikelyTableRow(suffix)) continue;
    if (!isTableLikeSuffix(suffix)) continue;
    if (canTrimSidePanelTableSuffix(row, start, suffix)) return suffix;
  }
  if (isTableLikeSuffix(row)) return row;
  for (let end = row.length - 1; end >= TABLE_ROW_MIN_CELLS; end--) {
    const prefix = row.slice(0, end);
    const trailing = row.slice(end);
    if (!isLikelyTableRow(prefix)) continue;
    if (!isTableLikeSuffix(prefix)) continue;
    if (canTrimTrailingProseTablePrefix(prefix, trailing)) return prefix;
  }
  return row;
}

function isLikelyTableRow(row: LayoutLine[]): boolean {
  const numericCells = row.filter((line) => isTableNumericCell(line.text)).length;
  if (row.length === TABLE_ROW_MIN_NUMERIC_CELLS) return numericCells === TABLE_ROW_MIN_NUMERIC_CELLS;
  if (row.length < TABLE_ROW_MIN_CELLS) return false;
  return numericCells >= TABLE_ROW_MIN_NUMERIC_CELLS;
}

function isTableLikeSuffix(row: LayoutLine[]): boolean {
  const numericCells = row.filter((line) => isTableNumericCell(line.text)).length;
  if (numericCells < TABLE_ROW_MIN_NUMERIC_CELLS) return false;
  return row.every(
    (line) => isTableNumericCell(line.text) || isCurrencyOnlyCell(line.text) || isCompactTableLabelCell(line),
  );
}

function isTwoColumnNumericOnlyTable(rows: LayoutLine[][]): boolean {
  return rows.every((row) => {
    const normalized = normalizeTableCurrencyCells(row);
    return normalized.length === 2 && normalized.every((cell) => isTableNumericCell(cell.text));
  });
}

function isCompactTableLabelCell(line: LayoutLine): boolean {
  const text = line.text.replace(/\s+/g, ' ').trim();
  if (text.length === 0 || text.length > TABLE_COMPACT_LABEL_MAX_CHARS) return false;
  if (!/[\p{L}]/u.test(text)) return false;
  return line.width <= TABLE_COMPACT_LABEL_MAX_WIDTH_PT;
}

function hasSidePanelTableGap(row: LayoutLine[], start: number): boolean {
  const prev = row[start - 1];
  const cur = row[start];
  if (!prev || !cur) return false;
  const gap = cur.x - (prev.x + prev.width);
  return gap >= Math.max(TABLE_SIDE_PANEL_MIN_GAP_PT, cur.fontSize * 4);
}

function canTrimSidePanelTableSuffix(row: LayoutLine[], start: number, suffix: LayoutLine[]): boolean {
  if (!hasSidePanelTableGap(row, start)) return false;
  const firstSuffixCell = suffix[0];
  const previousCell = row[start - 1];
  const startsWithCompactLabel =
    firstSuffixCell !== undefined &&
    !isTableNumericCell(firstSuffixCell.text) &&
    isCompactTableLabelCell(firstSuffixCell);
  if (start === 1) return startsWithCompactLabel && isProseBeforeSidePanel(row[0]);
  if (!startsWithCompactLabel && previousCell && isTableNumericCell(previousCell.text)) return false;
  return startsWithCompactLabel || row.slice(0, start).some(isProseBeforeSidePanel);
}

function canTrimTrailingProseTablePrefix(prefix: LayoutLine[], trailing: LayoutLine[]): boolean {
  const lastPrefixCell = prefix.at(-1);
  const firstTrailingCell = trailing[0];
  if (!lastPrefixCell || !firstTrailingCell) return false;
  const gap = firstTrailingCell.x - (lastPrefixCell.x + lastPrefixCell.width);
  if (gap < Math.max(TABLE_SIDE_PANEL_MIN_GAP_PT, firstTrailingCell.fontSize * 4)) return false;
  return trailing.every(isProseBeforeSidePanel);
}

function isProseBeforeSidePanel(line: LayoutLine): boolean {
  const text = line.text.replace(/\s+/g, ' ').trim();
  if (!/[\p{L}]/u.test(text)) return false;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < 4) return false;
  return line.width > TABLE_COMPACT_LABEL_MAX_WIDTH_PT || /[.!?:;]/u.test(text);
}

function attachNumericContinuationRows(
  table: IndexedLayoutRow[],
  allRows: LayoutLine[][],
  scanEndIndex: number,
): LayoutLine[][] {
  const baseRowsByIndex = new Map(table.map(({ row, index }) => [index, row]));
  const baseRows = table.map(({ row }) => row);
  const numericColumnRights = recurringNumericColumnRights(baseRows, {
    minColumns: TABLE_ROW_MIN_NUMERIC_CELLS,
    minRows: Math.min(
      baseRows.length,
      Math.max(2, Math.ceil(baseRows.length * TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROW_RATIO)),
    ),
  });
  if (numericColumnRights.length < TABLE_ROW_MIN_NUMERIC_CELLS) return baseRows;

  const firstIndex = table[0]?.index ?? 0;
  const lastBaseIndex = table.at(-1)?.index ?? firstIndex;
  const rows: LayoutLine[][] = [];
  let previousIncluded: LayoutLine[] | undefined;
  for (let index = firstIndex; index < scanEndIndex; index++) {
    const baseRow = baseRowsByIndex.get(index);
    if (baseRow) {
      rows.push(baseRow);
      previousIncluded = baseRow;
      continue;
    }

    if (!previousIncluded) continue;
    const candidate = allRows[index];
    if (!candidate) continue;
    const verticalGap = rowY(candidate) - rowBottom(previousIncluded);
    if (index > lastBaseIndex && verticalGap > TABLE_GROUP_MAX_ROW_GAP_PT) break;
    if (verticalGap > TABLE_GROUP_MAX_ROW_GAP_PT) continue;
    if (!isAlignedNumericContinuationRow(candidate, numericColumnRights)) continue;

    rows.push(candidate);
    previousIncluded = candidate;
  }
  return rows;
}

function attachLeadingTableRows(rows: LayoutLine[][], firstBaseIndex: number, allRows: LayoutLine[][]): LayoutLine[][] {
  const numericColumnRights = recurringNumericColumnRights(rows, {
    minColumns: TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS,
    minRows: Math.min(rows.length, Math.max(2, Math.ceil(rows.length * TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROW_RATIO))),
  });
  const leadingColumnRights =
    numericColumnRights.length >= TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS
      ? numericColumnRights
      : firstRowNumericColumnRights(rows);
  if (leadingColumnRights.length < TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS) return rows;

  const labelLeft = recurringLabelColumnLeft(rows);
  const tableBox = unionBox(rows.flat());
  const leadingRows: LayoutLine[][] = [];
  let nextIncluded = rows[0];

  for (let index = firstBaseIndex - 1; index >= 0; index--) {
    const candidate = allRows[index];
    if (!candidate || !nextIncluded) break;

    const verticalGap = rowY(nextIncluded) - rowBottom(candidate);
    if (verticalGap < -TABLE_LEADING_ROW_MAX_OVERLAP_PT || verticalGap > TABLE_LEADING_ROW_MAX_GAP_PT) break;
    if (!isLeadingTableRow(candidate, tableBox, leadingColumnRights, labelLeft, leadingRows.length > 0)) break;

    leadingRows.unshift(candidate);
    nextIncluded = candidate;
  }

  return leadingRows.length > 0 ? [...leadingRows, ...rows] : rows;
}

function firstRowNumericColumnRights(rows: LayoutLine[][]): number[] {
  if (rows.length < TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROWS) return [];
  const firstRow = rows[0];
  if (!firstRow) return [];
  const numericCells = firstRow.filter((line) => isTableNumericCell(line.text));
  if (numericCells.length < TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS) return [];
  return numericCells.map((line, index) => numericColumnMatchRight(line, numericCells[index + 1]));
}

function recurringLabelColumnLeft(rows: LayoutLine[][]): number | undefined {
  const lefts = rows
    .map((row) => row.find((line) => !isTableNumericCell(line.text) && !isCurrencyOnlyCell(line.text)))
    .filter((line): line is LayoutLine => line !== undefined && isCompactTableLabelCell(line))
    .map((line) => line.x);
  if (lefts.length < 2) return undefined;
  return medianNumber(lefts);
}

function isLeadingTableRow(
  row: LayoutLine[],
  tableBox: BBox,
  numericColumnRights: number[],
  labelLeft: number | undefined,
  allowSingleLabelHeader: boolean,
): boolean {
  if (row.length === 0) return false;
  if (!row.every(isCompactLeadingTableCell)) return false;

  const rowBox = unionBox(row);
  if (!hasTableBandOverlap(rowBox, tableBox)) return false;

  const alignedNumericCells = row.filter((line) => {
    if (!isTableNumericCell(line.text)) return false;
    const right = numericColumnMatchRight(line, undefined);
    return numericColumnRights.some(
      (columnRight) => Math.abs(columnRight - right) <= TABLE_RECURRING_NUMERIC_COLUMN_TOLERANCE_PT,
    );
  });
  const labelAligned =
    labelLeft !== undefined &&
    row.some(
      (line) => Math.abs(line.x - labelLeft) <= TABLE_LEADING_ROW_X_TOLERANCE_PT && isCompactTableLabelCell(line),
    );

  if (alignedNumericCells.length > 0) return row.length >= 2 || labelAligned;
  if (row.length >= 2) return true;
  return allowSingleLabelHeader && labelAligned;
}

function isCompactLeadingTableCell(line: LayoutLine): boolean {
  const text = line.text.replace(/\s+/g, ' ').trim();
  if (text.length === 0 || text.length > TABLE_LEADING_HEADER_MAX_CHARS) return false;
  if (isTableNumericCell(text) || isCurrencyOnlyCell(text)) return true;
  if (!/[\p{L}]/u.test(text)) return false;
  if (/[!?:;]/u.test(text) || /\.(?:\s|$)/u.test(text)) return false;
  if (text.split(/\s+/).filter(Boolean).length > TABLE_LEADING_HEADER_MAX_WORDS) return false;
  return line.width <= TABLE_LEADING_HEADER_MAX_WIDTH_PT;
}

function hasTableBandOverlap(rowBox: BBox, tableBox: BBox): boolean {
  const left = tableBox.x - TABLE_LEADING_ROW_X_TOLERANCE_PT;
  const right = tableBox.x + tableBox.width + TABLE_LEADING_ROW_X_TOLERANCE_PT;
  const overlap = Math.min(rowBox.x + rowBox.width, right) - Math.max(rowBox.x, left);
  return overlap > 0 && overlap >= Math.min(rowBox.width, tableBox.width) * 0.6;
}

function recurringNumericColumnRights(
  rows: LayoutLine[][],
  options: { minColumns: number; minRows: number },
): number[] {
  const columns: { right: number; rowIndexes: Set<number>; sampleCount: number }[] = [];
  for (const [rowIndex, row] of rows.entries()) {
    const numericCells = row.filter((line) => isTableNumericCell(line.text));
    for (let cellIndex = 0; cellIndex < numericCells.length; cellIndex++) {
      const line = numericCells[cellIndex];
      if (!line) continue;
      const right = numericColumnMatchRight(line, numericCells[cellIndex + 1]);
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
  const recurringColumns = columns
    .filter((column) => column.rowIndexes.size >= options.minRows)
    .sort((a, b) => a.right - b.right)
    .map((column) => column.right);
  return recurringColumns.length >= options.minColumns ? recurringColumns : [];
}

function isAlignedNumericContinuationRow(row: LayoutLine[], columnRights: number[]): boolean {
  const valueCells = row.filter((line) => isTableNumericCell(line.text));
  if (valueCells.length < TABLE_ROW_MIN_NUMERIC_CELLS) return false;
  if (row.some((line) => !isTableNumericCell(line.text) && !isCurrencyOnlyCell(line.text))) return false;

  let matchedCells = 0;
  const matchedColumns = new Set<number>();
  for (let cellIndex = 0; cellIndex < valueCells.length; cellIndex++) {
    const cell = valueCells[cellIndex];
    if (!cell) continue;
    const right = numericColumnMatchRight(cell, valueCells[cellIndex + 1]);
    const columnIndex = columnRights.findIndex(
      (columnRight) => Math.abs(columnRight - right) <= TABLE_RECURRING_NUMERIC_COLUMN_TOLERANCE_PT,
    );
    if (columnIndex < 0) return false;
    matchedCells += 1;
    matchedColumns.add(columnIndex);
  }
  return matchedCells >= TABLE_ROW_MIN_NUMERIC_CELLS && matchedColumns.size >= TABLE_ROW_MIN_NUMERIC_CELLS;
}

function numericColumnMatchRight(cell: LayoutLine, nextNumericCell: LayoutLine | undefined): number {
  const trailing = trailingCurrencyForNextValue(cell.text, nextNumericCell);
  if (!trailing) return cell.x + cell.width;

  const trimmed = cell.text.trim();
  const valueText = trimmed.slice(0, -trailing.length).trimEnd();
  if (trimmed.length === 0 || valueText.length === 0) return cell.x + cell.width;
  return cell.x + cell.width * (valueText.length / trimmed.length);
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
  return (
    recurringNumericColumnRights(rows, {
      minColumns: TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS,
      minRows,
    }).length >= TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS
  );
}

function hasTableLabelCell(row: LayoutLine[]): boolean {
  return row.some((line) => !isTableNumericCell(line.text) && /[\p{L}]/u.test(line.text));
}

function isTableNumericCell(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || !/\d/u.test(trimmed)) return false;
  const withoutRatioSuffix = trimmed.replace(/(?<=\d)\s*[xX]$/u, '');
  const withoutScoreWords = withoutRatioSuffix
    .replace(/\b(?:below|under|over|above|about|approximately)\s+(?=\d)/giu, '')
    .replace(/(?<=\d)(?:st|nd|rd|th)\b/giu, '');
  return withoutScoreWords.replace(/[0-9.,()%$¥€£+\-/~\s·⋅∙×^]/gu, '').length === 0;
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

function detectRecurringSidePanelStartBins(lineGroups: TextSpan[][], pageWidth: number): Set<number> {
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
      if (isRecurringSidePanelStartCandidate(groupBox, prev, cur, gap, fontSize, pageWidth)) {
        binsInRow.add(Math.round(cur.x / RECURRING_GUTTER_BIN_PT) * RECURRING_GUTTER_BIN_PT);
      }
    }
    for (const bin of binsInRow) counts.set(bin, (counts.get(bin) ?? 0) + 1);
  }

  const recurring = new Set<number>();
  for (const [bin, count] of counts) {
    if (count >= RECURRING_SIDE_PANEL_MIN_ROWS) recurring.add(bin);
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

function hasRecurringSidePanelStart(recurringSidePanelStartBins: Set<number>, cur: TextSpan): boolean {
  if (recurringSidePanelStartBins.size === 0) return false;
  const bin = Math.round(cur.x / RECURRING_GUTTER_BIN_PT) * RECURRING_GUTTER_BIN_PT;
  for (const recurringBin of recurringSidePanelStartBins) {
    if (Math.abs(recurringBin - bin) <= RECURRING_GUTTER_BIN_PT) return true;
  }
  return false;
}

function isRecurringSidePanelStartCandidate(
  groupBox: BBox,
  prev: TextSpan,
  cur: TextSpan,
  gap: number,
  fontSize: number,
  pageWidth: number,
): boolean {
  if (pageWidth <= 0) return false;
  if (groupBox.width < pageWidth * RECURRING_SIDE_PANEL_ROW_MIN_WIDTH_RATIO) return false;
  if (cur.x < pageWidth * RECURRING_SIDE_PANEL_START_RATIO) return false;
  if (gap < Math.max(fontSize * RECURRING_SIDE_PANEL_GAP_RATIO, RECURRING_SIDE_PANEL_MIN_GAP_PT)) return false;

  const leftWidth = prev.x + prev.width - groupBox.x;
  return leftWidth >= pageWidth * RECURRING_SIDE_PANEL_LEFT_MIN_RATIO;
}

function isRecurringTableGutterCandidate(groupBox: BBox, gap: number, fontSize: number, pageWidth: number): boolean {
  if (groupBox.width < Math.min(pageWidth * 0.4, RECURRING_TABLE_GUTTER_MIN_WIDTH_PT)) return false;
  return gap >= Math.max(fontSize * RECURRING_GUTTER_GAP_RATIO, RECURRING_GUTTER_MIN_GAP_PT);
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

function isTableGutterNumericSpan(span: TextSpan): boolean {
  const text = span.text.trim();
  return text === '-' || isTableNumericCell(text);
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

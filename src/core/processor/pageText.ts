import type { TextSpan } from '../../types/index.js';
import type { LineGlyphLookup } from '../graphics/lineGlyphs.js';
import {
  extractHorizontalRubyAnalysis,
  type HorizontalRubyAssociation,
  horizontalRubyReadingText,
} from '../layout/horizontalRuby.js';
import { mergeSameOffsetRubyTextAttachments } from '../layout/rubyMerge.js';
import { markExplicitSpaceBefore, markSpanTurn, type QuarterTurn } from '../layout/spanMetadata.js';
import {
  extractBodyVerticalCjkRunAnalysis,
  extractTallVerticalRuns,
  rubyAssociationText,
  type TallVerticalRun,
  type VerticalCjkRunBlock,
  type VerticalRubyAssociation,
} from '../layout/verticalText.js';
import { type JoinItem, joinPageText, type VerticalJoinRun } from '../text/cjkJoin.js';
import type { PageFontTextHints } from '../text/fontTextHints.js';
import { textMatrixFontSize, textRunGeometryFromTransform } from '../text/geometry.js';
import { isLikelyPrepressProductionText } from '../text/prepress.js';
import { prepareTextItems } from '../text/textItemPasses.js';
import type { PageFlags } from './pageData.js';
import { normalizeText, normalizeTextForNonPrintableStats, textItemDedupeKey } from './textUtils.js';

interface TextContentLike {
  items: unknown[];
  /** pdf.js per-font text styles; `fontFamily` is `monospace` for fixed-pitch fonts. */
  styles?: Readonly<Record<string, unknown>>;
}

interface TextItemLike {
  str: string;
  width?: unknown;
  height?: unknown;
  transform?: readonly number[];
  fontName?: unknown;
  hasEOL?: unknown;
  dir?: unknown;
}

interface ExtractPageTextInput {
  content: TextContentLike;
  flags: PageFlags;
  pageHeight: number;
  viewMinX: number;
  viewMinY: number;
  /** Per-font facts from the operator list (symbol-font glyphs, tracked words). */
  fontHints?: PageFontTextHints;
  /** Where glyphs on a line were drawn, for text spread glyph by glyph. */
  lineGlyphs?: LineGlyphLookup;
}

interface RubyTextAttachment {
  offset: number;
  text: string;
}

interface PageTextIntakeInput extends ExtractPageTextInput {
  wantSpans: boolean;
}

interface PageTextIntakeResult {
  joinItems: JoinItem[];
  textArea: number;
  spans: TextSpan[];
  monospaceFonts: ReadonlySet<string>;
  verticalJoinSpans: TextSpan[];
  verticalJoinSpanIndices: ReadonlyMap<TextSpan, number>;
}

interface RawPageTextInput {
  joinItems: readonly JoinItem[];
  verticalJoinSpans: readonly TextSpan[];
  verticalJoinSpanIndices: ReadonlyMap<TextSpan, number>;
}

export interface ExtractedPageText {
  text: string;
  rawText?: string;
  nonPrintableSourceText: string;
  textArea: number;
  spans: TextSpan[];
  /** Span `fontName` aliases whose font pdf.js reports as fixed-pitch. */
  monospaceFonts: ReadonlySet<string>;
  searchSpans?: TextSpan[];
}

export function extractPageText({
  content,
  flags,
  pageHeight,
  viewMinX,
  viewMinY,
  fontHints,
  lineGlyphs,
}: ExtractPageTextInput): ExtractedPageText {
  const wantSpans =
    flags.geometry ||
    flags.layout ||
    flags.visualRegions ||
    flags.formFields ||
    flags.links ||
    flags.needSpansForSearch ||
    flags.needSpansForWarnings ||
    flags.needFormFieldsForSearch;

  const { joinItems, textArea, spans, monospaceFonts, verticalJoinSpans, verticalJoinSpanIndices } =
    collectPageTextItems({
      content: { items: prepareTextItems(content.items, fontHints, lineGlyphs), styles: content.styles },
      flags,
      pageHeight,
      viewMinX,
      viewMinY,
      wantSpans,
    });
  const rawText = composeRawPageText({
    joinItems,
    verticalJoinSpans,
    verticalJoinSpanIndices,
  });
  const text = flags.normalize ? normalizeText(rawText) : rawText;
  const nonPrintableSourceText = flags.normalize ? normalizeTextForNonPrintableStats(rawText) : rawText;
  const preservedRaw = flags.normalize && rawText !== text ? rawText : undefined;

  return {
    text,
    rawText: preservedRaw,
    nonPrintableSourceText,
    textArea,
    spans,
    monospaceFonts,
    ...(flags.needSpansForSearch && {
      searchSpans: spans,
    }),
  };
}

function collectPageTextItems({
  content,
  flags,
  pageHeight,
  viewMinX,
  viewMinY,
  wantSpans,
}: PageTextIntakeInput): PageTextIntakeResult {
  // Collect typed items for the CJK-aware page-text joiner. We can't
  // build the final string in this loop because the join decision for
  // a whitespace item depends on its neighbours' positions, which we
  // only know after the walk.
  const joinItems: JoinItem[] = [];
  let textArea = 0;
  const spans: TextSpan[] = [];
  const verticalJoinSpans: TextSpan[] = [];
  const verticalJoinSpanIndices = new Map<TextSpan, number>();
  const seenTextItems = new Map<string, number>();
  const pageFontAliases = new Map<string, string>();
  let previousSpanOnLine: TextSpan | undefined;
  let pendingExplicitSpace = false;
  for (const item of content.items) {
    if (!isTextItem(item)) continue;
    if (isLikelyPrepressProductionText(item.str)) continue;
    const w = finiteOrZero(item.width);
    // pdf.js reports item.height as 0 for many PDFs (e.g. those produced by
    // certain Office exporters); fall back to the vertical scale from the
    // text matrix, which approximates the text item's height in user units.
    const reportedH = finiteOrZero(item.height);
    const transform = item.transform;
    const h = reportedH > 0 ? reportedH : transform ? textMatrixFontSize(transform) : 0;
    const itemKey = textItemDedupeKey(item.str, w, h, transform, item.fontName);
    const seenIndex = seenTextItems.get(itemKey);
    if (seenIndex !== undefined) {
      // Deduplication keys use raw text/font plus effective height, width, and
      // every transform component at three-decimal precision. Keep the first
      // item but preserve the hard-EOL signal if any matching draw carries it.
      if (item.hasEOL) joinItems[seenIndex].hasEOL = true;
      if (item.hasEOL) {
        previousSpanOnLine = undefined;
        pendingExplicitSpace = false;
      }
      continue;
    }
    textArea += Math.abs(w * h);

    const geometry = transform
      ? textRunGeometryFromTransform({
          transform,
          width: w,
          height: h,
          pageHeight,
          viewMinX,
          viewMinY,
          dir: typeof item.dir === 'string' ? item.dir : undefined,
        })
      : undefined;

    // Feed the page-text joiner. x/fontSize default to 0 when the
    // item lacks a transform (pdf.js does this for synthetic-EOL
    // items); the joiner already handles zero fontSize by falling back
    // to a neighbour.
    const itemX = transform ? transform[4] : 0;
    const itemFontSize = transform ? textMatrixFontSize(transform, h) : h;
    seenTextItems.set(itemKey, joinItems.length);
    const joinItemIndex = joinItems.length;
    joinItems.push({
      str: item.str,
      x: itemX,
      ...(geometry && { y: geometry.y }),
      width: w,
      fontSize: itemFontSize,
      hasEOL: !!item.hasEOL,
      ...(typeof item.dir === 'string' && { dir: item.dir }),
    });

    // Skip whitespace-only items in spans output — pdf.js can emit standalone
    // positioned-space items whose synthetic widths may exceed the page.
    // Preserve real word boundaries as private adjacency metadata so the
    // layout text joiner can still reconstruct RTL lines without changing
    // the public TextSpan schema.
    const spanText = flags.normalize ? normalizeText(item.str) : item.str;
    const explicitWhitespace = item.str.length > 0 && item.str.trim().length === 0;
    if (wantSpans && spanText.trim().length > 0 && geometry) {
      const span: TextSpan = {
        text: spanText,
        ...geometry,
        ...(typeof item.fontName === 'string' && { fontName: stablePageFontName(item.fontName, pageFontAliases) }),
      };
      if (pendingExplicitSpace && previousSpanOnLine) markExplicitSpaceBefore(span);
      const turn = transform && item.dir !== 'ttb' ? quarterTurn(transform) : undefined;
      if (turn !== undefined) markSpanTurn(span, turn);
      spans.push(span);
      previousSpanOnLine = span;
      pendingExplicitSpace = false;
    } else if (wantSpans && explicitWhitespace) {
      if (previousSpanOnLine && !item.hasEOL) pendingExplicitSpace = true;
    } else if (wantSpans && item.str.length > 0) {
      previousSpanOnLine = undefined;
      pendingExplicitSpace = false;
    }
    if (item.hasEOL) {
      previousSpanOnLine = undefined;
      pendingExplicitSpace = false;
    }
    if (item.str.trim().length > 0 && geometry) {
      const span = {
        text: item.str,
        ...geometry,
      };
      verticalJoinSpans.push(span);
      verticalJoinSpanIndices.set(span, joinItemIndex);
    }
  }

  const monospaceFonts = new Set<string>();
  for (const [rawFontName, alias] of pageFontAliases) {
    const style = content.styles?.[rawFontName];
    if (style && typeof style === 'object' && (style as { fontFamily?: unknown }).fontFamily === 'monospace') {
      monospaceFonts.add(alias);
    }
  }

  return {
    joinItems,
    textArea,
    spans,
    monospaceFonts,
    verticalJoinSpans,
    verticalJoinSpanIndices,
  };
}

// A baseline within this many degrees of a quarter turn reads as sideways (or upside-down) text.
const QUARTER_TURN_TOLERANCE_DEG = 3;

/** The quarter turn a text matrix sets its baseline to, or undefined when it is not one or is mirrored. */
function quarterTurn(transform: readonly number[]): QuarterTurn | undefined {
  const [a = 0, b = 0, c = 0, d = 0] = transform;
  if (!(Math.hypot(a, b) > 1e-6) || !(a * d - b * c > 0)) return undefined;
  const angle = ((((Math.atan2(b, a) * 180) / Math.PI) % 360) + 360) % 360;
  for (const turn of [90, 180, 270] as const) {
    if (Math.abs(angle - turn) <= QUARTER_TURN_TOLERANCE_DEG) return turn;
  }
  return undefined;
}

function composeRawPageText({ joinItems, verticalJoinSpans, verticalJoinSpanIndices }: RawPageTextInput): string {
  const verticalAnalysis = extractBodyVerticalCjkRunAnalysis(verticalJoinSpans);
  const tallVerticalRuns = extractTallVerticalRuns(verticalJoinSpans).filter((run) => run.hasTatechuyoko);
  const verticalAnalysisSpans = collectVerticalAnalysisSpans(verticalAnalysis);
  const horizontalAnalysis =
    verticalAnalysis.rubyAssociations.length > 0
      ? { rubySpans: [], rubyAssociations: [] }
      : extractHorizontalRubyAnalysis(
          verticalAnalysisSpans.size > 0
            ? verticalJoinSpans.filter((span) => !verticalAnalysisSpans.has(span))
            : verticalJoinSpans,
        );
  const rubyItemIndices = collectRubyItemIndices(verticalAnalysis.rubySpans, verticalJoinSpanIndices);
  const horizontalRubyItemIndices = collectRubyItemIndices(horizontalAnalysis.rubySpans, verticalJoinSpanIndices);
  const gutterAnnotationItemIndices = collectRubyItemIndices(
    verticalAnalysis.gutterAnnotationSpans,
    verticalJoinSpanIndices,
  );
  const excludedTextItemIndices = new Set([
    ...rubyItemIndices,
    ...horizontalRubyItemIndices,
    ...gutterAnnotationItemIndices,
  ]);
  const rubyAttachments = mergeRubyTextAttachments(
    collectRubyTextAttachments(verticalAnalysis.rubyAssociations, verticalJoinSpanIndices),
    collectHorizontalRubyTextAttachments(horizontalAnalysis.rubyAssociations, verticalJoinSpanIndices),
  );
  const filteredJoin = filterRubyJoinItems(joinItems, excludedTextItemIndices, rubyAttachments);
  return joinPageText(filteredJoin.items, {
    verticalRuns: [
      ...buildTallVerticalJoinRuns(tallVerticalRuns, verticalJoinSpanIndices, filteredJoin.indexMap),
      ...buildVerticalJoinRuns(
        verticalAnalysis.blocks,
        verticalJoinSpanIndices,
        filteredJoin.indexMap,
        verticalAnalysis.rubySpans.length > 0,
      ),
    ],
  }).trimEnd();
}

function buildTallVerticalJoinRuns(
  runs: readonly TallVerticalRun[],
  spanItemIndices: ReadonlyMap<TextSpan, number>,
  itemIndexMap: ReadonlyMap<number, number>,
): VerticalJoinRun[] {
  const joinRuns: VerticalJoinRun[] = [];
  for (const run of runs) {
    const itemIndices: number[] = [];
    for (const span of run.spans) {
      const index = spanItemIndices.get(span);
      if (index === undefined) continue;
      const mappedIndex = itemIndexMap.get(index);
      if (mappedIndex === undefined) continue;
      itemIndices.push(mappedIndex);
    }
    if (itemIndices.length === run.spans.length) {
      joinRuns.push({
        itemIndices,
        lineBreakAfter: true,
      });
    }
  }
  return joinRuns;
}

function buildVerticalJoinRuns(
  blocks: readonly VerticalCjkRunBlock[],
  spanItemIndices: ReadonlyMap<TextSpan, number>,
  itemIndexMap: ReadonlyMap<number, number>,
  joinColumnsInBlock: boolean,
): VerticalJoinRun[] {
  const runs: VerticalJoinRun[] = [];
  for (const block of blocks) {
    const columns = [...block.columns].sort((a, b) => b.centerX - a.centerX);
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
      const column = columns[columnIndex];
      const itemIndices: number[] = [];
      for (const span of column.spans) {
        const index = spanItemIndices.get(span);
        if (index === undefined) continue;
        const mappedIndex = itemIndexMap.get(index);
        if (mappedIndex === undefined) continue;
        itemIndices.push(mappedIndex);
      }
      if (column.spans.length < 2) continue;
      if (itemIndices.length === column.spans.length) {
        runs.push({
          itemIndices,
          lineBreakAfter: !(joinColumnsInBlock && columnIndex < columns.length - 1),
        });
      }
    }
  }
  return runs;
}

function collectRubyItemIndices(
  rubySpans: readonly TextSpan[],
  spanItemIndices: ReadonlyMap<TextSpan, number>,
): Set<number> {
  const indices = new Set<number>();
  for (const span of rubySpans) {
    const index = spanItemIndices.get(span);
    if (index !== undefined) indices.add(index);
  }
  return indices;
}

function collectVerticalAnalysisSpans(analysis: {
  blocks: readonly VerticalCjkRunBlock[];
  rubySpans: readonly TextSpan[];
  gutterAnnotationSpans: readonly TextSpan[];
}): ReadonlySet<TextSpan> {
  const spans = new Set<TextSpan>([...analysis.rubySpans, ...analysis.gutterAnnotationSpans]);
  for (const block of analysis.blocks) {
    for (const column of block.columns) {
      for (const span of column.spans) spans.add(span);
    }
  }
  return spans;
}

function collectRubyTextAttachments(
  rubyAssociations: readonly VerticalRubyAssociation[],
  spanItemIndices: ReadonlyMap<TextSpan, number>,
): ReadonlyMap<number, readonly RubyTextAttachment[]> {
  const attachments = new Map<number, RubyTextAttachment[]>();
  for (const association of rubyAssociations) {
    const baseEnd = association.baseRanges.at(-1);
    if (!baseEnd) continue;
    const index = spanItemIndices.get(baseEnd.span);
    if (index === undefined) continue;
    const attachment = { offset: baseEnd.end, text: rubyAssociationText(association) };
    const texts = attachments.get(index);
    if (texts) {
      texts.push(attachment);
    } else {
      attachments.set(index, [attachment]);
    }
  }
  return attachments;
}

function collectHorizontalRubyTextAttachments(
  rubyAssociations: readonly HorizontalRubyAssociation[],
  spanItemIndices: ReadonlyMap<TextSpan, number>,
): ReadonlyMap<number, readonly RubyTextAttachment[]> {
  const attachments = new Map<number, RubyTextAttachment[]>();
  for (const association of rubyAssociations) {
    const baseEnd = association.baseRanges.at(-1);
    if (!baseEnd) continue;
    const index = spanItemIndices.get(baseEnd.span);
    if (index === undefined) continue;
    const attachment = { offset: baseEnd.end, text: horizontalRubyReadingText(association) };
    const texts = attachments.get(index);
    if (texts) {
      texts.push(attachment);
    } else {
      attachments.set(index, [attachment]);
    }
  }
  return attachments;
}

function mergeRubyTextAttachments(
  ...sources: readonly ReadonlyMap<number, readonly RubyTextAttachment[]>[]
): ReadonlyMap<number, readonly RubyTextAttachment[]> {
  const merged = new Map<number, RubyTextAttachment[]>();
  for (const source of sources) {
    for (const [index, attachments] of source) {
      const existing = merged.get(index);
      if (existing) {
        existing.push(...attachments);
      } else {
        merged.set(index, [...attachments]);
      }
    }
  }
  return merged;
}

function filterRubyJoinItems(
  items: readonly JoinItem[],
  rubyItemIndices: ReadonlySet<number>,
  rubyAttachments: ReadonlyMap<number, readonly RubyTextAttachment[]> = new Map(),
): { items: JoinItem[]; indexMap: ReadonlyMap<number, number> } {
  const filtered: JoinItem[] = [];
  const indexMap = new Map<number, number>();

  for (let index = 0; index < items.length; index++) {
    if (rubyItemIndices.has(index) || isRubyAdjacentSeparator(items, index, rubyItemIndices)) continue;
    indexMap.set(index, filtered.length);
    const attachments = rubyAttachments.get(index);
    const item = attachments && attachments.length > 0 ? attachRubyText(items[index], attachments) : items[index];
    const verticalAdjusted =
      attachments && attachments.length > 0
        ? clearTrailingRubyEolBeforeVerticalContinuation(item, items, index, rubyItemIndices, attachments)
        : item;
    filtered.push(clearTrailingRubyEolBeforeHorizontalContinuation(verticalAdjusted, items, index, rubyItemIndices));
  }

  return { items: filtered, indexMap };
}

function attachRubyText(item: JoinItem, attachments: readonly RubyTextAttachment[]): JoinItem {
  return {
    ...item,
    str: itemTextWithRuby(item.str, attachments),
  };
}

function itemTextWithRuby(text: string, attachments: readonly RubyTextAttachment[]): string {
  const sorted = mergeSameOffsetRubyTextAttachments(attachments);
  let out = '';
  let cursor = 0;
  for (const attachment of sorted) {
    const offset = Math.max(cursor, Math.min(text.length, attachment.offset));
    out += text.slice(cursor, offset);
    out += `《${attachment.text}》`;
    cursor = offset;
  }
  return out + text.slice(cursor);
}

function clearTrailingRubyEolBeforeVerticalContinuation(
  item: JoinItem,
  items: readonly JoinItem[],
  index: number,
  rubyItemIndices: ReadonlySet<number>,
  attachments: readonly RubyTextAttachment[],
): JoinItem {
  if (!item.hasEOL || !attachments.some((attachment) => attachment.offset >= items[index].str.length)) return item;
  const next = nextNonRubyTextItem(items, index, rubyItemIndices);
  if (!next || !isSameVerticalColumnContinuation(items[index], next)) return item;
  return { ...item, hasEOL: false, continuesVerticalFlow: true };
}

function nextNonRubyTextItem(
  items: readonly JoinItem[],
  index: number,
  rubyItemIndices: ReadonlySet<number>,
): JoinItem | undefined {
  return nextNonRubyTextItemWithIndex(items, index, rubyItemIndices)?.item;
}

function nextNonRubyTextItemWithIndex(
  items: readonly JoinItem[],
  index: number,
  rubyItemIndices: ReadonlySet<number>,
): { index: number; item: JoinItem } | undefined {
  for (let nextIndex = index + 1; nextIndex < items.length; nextIndex++) {
    if (rubyItemIndices.has(nextIndex) || isRubyAdjacentSeparator(items, nextIndex, rubyItemIndices)) continue;
    if (items[nextIndex].str.trim().length > 0) return { index: nextIndex, item: items[nextIndex] };
  }
  return undefined;
}

function isSameVerticalColumnContinuation(prev: JoinItem, next: JoinItem): boolean {
  if (prev.dir !== 'ttb' || next.dir !== 'ttb') return false;
  if (prev.y === undefined || next.y === undefined) return false;
  const fontSize = Math.max(prev.fontSize, next.fontSize, 1);
  if (Math.abs(prev.x - next.x) > Math.max(fontSize * 0.2, 2)) return false;

  const estimatedBottom = prev.y + Array.from(prev.str).length * fontSize;
  return Math.abs(next.y - estimatedBottom) <= fontSize * 0.5;
}

function clearTrailingRubyEolBeforeHorizontalContinuation(
  item: JoinItem,
  items: readonly JoinItem[],
  index: number,
  rubyItemIndices: ReadonlySet<number>,
): JoinItem {
  if (!item.hasEOL || item.dir === 'ttb') return item;
  const next = nextNonRubyTextItemWithIndex(items, index, rubyItemIndices);
  if (!next || !hasRubyItemBetween(index, next.index, rubyItemIndices)) return item;
  if (!isSameHorizontalLineContinuation(items[index], next.item)) return item;
  return { ...item, hasEOL: false };
}

function hasRubyItemBetween(startIndex: number, endIndex: number, rubyItemIndices: ReadonlySet<number>): boolean {
  for (let index = startIndex + 1; index < endIndex; index++) {
    if (rubyItemIndices.has(index)) return true;
  }
  return false;
}

function isSameHorizontalLineContinuation(prev: JoinItem, next: JoinItem): boolean {
  if (prev.y === undefined || next.y === undefined) return false;
  if (next.dir === 'ttb') return false;
  const fontSize = Math.max(prev.fontSize, next.fontSize, 1);
  if (Math.abs(prev.y - next.y) > Math.max(fontSize * 0.45, 2)) return false;
  const gap = next.x - (prev.x + prev.width);
  if (gap < -fontSize * 0.25) return false;
  return gap <= Math.max(fontSize * 1.5, 24);
}

function isRubyAdjacentSeparator(
  items: readonly JoinItem[],
  index: number,
  rubyItemIndices: ReadonlySet<number>,
): boolean {
  if (rubyItemIndices.size === 0) return false;
  if (items[index].str.trim().length > 0) return false;

  const previous = nearestNonWhitespaceItemIndex(items, index, -1);
  if (previous !== undefined && rubyItemIndices.has(previous)) return true;

  const next = nearestNonWhitespaceItemIndex(items, index, 1);
  return next !== undefined && rubyItemIndices.has(next);
}

function nearestNonWhitespaceItemIndex(
  items: readonly JoinItem[],
  startIndex: number,
  direction: -1 | 1,
): number | undefined {
  for (let index = startIndex + direction; index >= 0 && index < items.length; index += direction) {
    if (items[index].str.trim().length > 0) return index;
  }
  return undefined;
}

function isTextItem(item: unknown): item is TextItemLike {
  return !!item && typeof item === 'object' && 'str' in item && typeof (item as TextItemLike).str === 'string';
}

function stablePageFontName(rawFontName: string, aliases: Map<string, string>): string {
  const existing = aliases.get(rawFontName);
  if (existing) return existing;
  const alias = `font${aliases.size + 1}`;
  aliases.set(rawFontName, alias);
  return alias;
}

// pdf.js can report NaN widths for whitespace items; one NaN would poison the
// page's text area (and so textCoverage) and every downstream box.
function finiteOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

import type { TextSpan } from '../../types/index.js';
import { extractBodyVerticalCjkRunAnalysis, type VerticalCjkRunBlock } from '../layout/verticalText.js';
import { type JoinItem, joinPageText, type VerticalJoinRun } from '../text/cjkJoin.js';
import { textMatrixFontSize, textRunGeometryFromTransform } from '../text/geometry.js';
import { isLikelyPrepressProductionText } from '../text/prepress.js';
import type { PageFlags } from './pageData.js';
import { normalizeText, textItemDedupeKey } from './textUtils.js';

interface TextContentLike {
  items: unknown[];
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
}

export interface ExtractedPageText {
  text: string;
  rawText?: string;
  textArea: number;
  spans: TextSpan[];
  searchSpans?: TextSpan[];
}

export function extractPageText({
  content,
  flags,
  pageHeight,
  viewMinX,
  viewMinY,
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

  // Collect typed items for the CJK-aware page-text joiner. We can't
  // build the final string in this loop because the join decision for
  // a whitespace item depends on its neighbours' positions, which we
  // only know after the walk.
  const joinItems: JoinItem[] = [];
  let textArea = 0;
  const spans: TextSpan[] = [];
  const spanItemIndices = new Map<TextSpan, number>();
  const verticalJoinSpans: TextSpan[] = [];
  const verticalJoinSpanIndices = new Map<TextSpan, number>();
  const seenTextItems = new Map<string, number>();
  const pageFontAliases = new Map<string, string>();
  for (const item of content.items) {
    if (!isTextItem(item)) continue;
    if (isLikelyPrepressProductionText(item.str)) continue;
    const w = typeof item.width === 'number' ? item.width : 0;
    // pdfjs reports item.height as 0 for many PDFs (e.g. those produced by
    // certain Office exporters); fall back to the vertical scale from the
    // text matrix, which is effectively the glyph height in user units.
    const reportedH = typeof item.height === 'number' ? item.height : 0;
    const transform = item.transform;
    const h = reportedH > 0 ? reportedH : transform ? textMatrixFontSize(transform) : 0;
    const itemKey = textItemDedupeKey(item.str, w, h, transform, item.fontName);
    const seenIndex = seenTextItems.get(itemKey);
    if (seenIndex !== undefined) {
      // Overprinted text often appears twice with identical geometry,
      // sometimes differing only in pdf.js' hard-EOL flag. Keep one text
      // run, but preserve the line-break signal if any duplicate carries it.
      if (item.hasEOL) joinItems[seenIndex].hasEOL = true;
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

    // Skip whitespace-only items in spans output — pdf.js emits a span
    // for every positioned space, which can double the array length and
    // sometimes carries a synthetic width that exceeds the page width.
    // The aggregate `text` already preserves the spaces, so layout
    // analysis loses nothing; downstream agents get a cleaner signal.
    if (wantSpans && item.str.trim().length > 0 && geometry) {
      const span = {
        text: flags.normalize ? normalizeText(item.str) : item.str,
        ...geometry,
        ...(typeof item.fontName === 'string' && { fontName: stablePageFontName(item.fontName, pageFontAliases) }),
      };
      spans.push(span);
      spanItemIndices.set(span, joinItemIndex);
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

  const verticalAnalysis = extractBodyVerticalCjkRunAnalysis(verticalJoinSpans);
  const rubyItemIndices = collectRubyItemIndices(verticalAnalysis.rubySpans, verticalJoinSpanIndices);
  const filteredJoin = filterRubyJoinItems(joinItems, rubyItemIndices);
  const rawText = joinPageText(filteredJoin.items, {
    verticalRuns: buildVerticalJoinRuns(
      verticalAnalysis.blocks,
      verticalJoinSpanIndices,
      filteredJoin.indexMap,
      verticalAnalysis.rubySpans.length > 0,
    ),
  }).trimEnd();
  const text = flags.normalize ? normalizeText(rawText) : rawText;
  const preservedRaw = flags.normalize && rawText !== text ? rawText : undefined;

  return {
    text,
    rawText: preservedRaw,
    textArea,
    spans,
    ...(flags.needSpansForSearch && {
      searchSpans:
        rubyItemIndices.size > 0
          ? spans.filter((span) => {
              const index = spanItemIndices.get(span);
              return index === undefined || !rubyItemIndices.has(index);
            })
          : spans,
    }),
  };
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

function filterRubyJoinItems(
  items: readonly JoinItem[],
  rubyItemIndices: ReadonlySet<number>,
): { items: JoinItem[]; indexMap: ReadonlyMap<number, number> } {
  const filtered: JoinItem[] = [];
  const indexMap = new Map<number, number>();

  for (let index = 0; index < items.length; index++) {
    if (rubyItemIndices.has(index) || isRubyAdjacentSeparator(items, index, rubyItemIndices)) continue;
    indexMap.set(index, filtered.length);
    filtered.push(items[index]);
  }

  return { items: filtered, indexMap };
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

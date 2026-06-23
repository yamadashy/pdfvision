import type { TextSpan } from '../../types/index.js';
import { type JoinItem, joinPageText } from '../text/cjkJoin.js';
import { textMatrixFontSize, textRunGeometryFromTransform } from '../text/geometry.js';
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
    flags.needFormFieldsForSearch;

  // Collect typed items for the CJK-aware page-text joiner. We can't
  // build the final string in this loop because the join decision for
  // a whitespace item depends on its neighbours' positions, which we
  // only know after the walk.
  const joinItems: JoinItem[] = [];
  let textArea = 0;
  const spans: TextSpan[] = [];
  const seenTextItems = new Map<string, number>();
  const pageFontAliases = new Map<string, string>();
  for (const item of content.items) {
    if (!isTextItem(item)) continue;
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
      spans.push({
        text: flags.normalize ? normalizeText(item.str) : item.str,
        ...geometry,
        ...(typeof item.fontName === 'string' && { fontName: stablePageFontName(item.fontName, pageFontAliases) }),
      });
    }
  }

  const rawText = joinPageText(joinItems).trimEnd();
  const text = flags.normalize ? normalizeText(rawText) : rawText;
  const preservedRaw = flags.normalize && rawText !== text ? rawText : undefined;

  return {
    text,
    rawText: preservedRaw,
    textArea,
    spans,
  };
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

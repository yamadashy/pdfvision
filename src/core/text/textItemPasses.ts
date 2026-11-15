import { mapSymbolFontText, type PageFontTextHints } from './fontTextHints.js';
import { joinJustifiedGlyphRuns, removeTrackingSpaces } from './letterSpacing.js';
import { collapseOverdrawnText } from './overdraw.js';
import { isRawTextItem } from './textItems.js';

/**
 * Correct pdf.js text-content items before page text, spans and layout are
 * built from them, so every surface reads the same corrected text. Order
 * matters: symbol glyphs are decoded first (later passes compare text), and
 * overdrawn copies are dropped before anything is merged.
 */
export function prepareTextItems(items: readonly unknown[], hints: PageFontTextHints = new Map()): unknown[] {
  let prepared = hints.size > 0 ? decodeSymbolFonts(items, hints) : [...items];
  prepared = collapseOverdrawnText(prepared);
  if (hints.size > 0) prepared = removeTrackingSpaces(prepared, hints);
  return joinJustifiedGlyphRuns(prepared);
}

function decodeSymbolFonts(items: readonly unknown[], hints: PageFontTextHints): unknown[] {
  return items.map((item) => {
    if (!isRawTextItem(item) || typeof item.fontName !== 'string') return item;
    const charMap = hints.get(item.fontName)?.charMap;
    if (!charMap) return item;
    const str = mapSymbolFontText(item.str, charMap);
    return str === item.str ? item : { ...item, str };
  });
}

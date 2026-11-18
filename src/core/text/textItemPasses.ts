import { joinBaselineRuns } from './baselineRuns.js';
import { mapSymbolFontText, type PageFontTextHints } from './fontTextHints.js';
import { joinJustifiedGlyphRuns, removeTrackingSpaces } from './letterSpacing.js';
import { collapseOverdrawnText } from './overdraw.js';
import { attachScripts } from './scripts.js';
import { isRawTextItem } from './textItems.js';

/**
 * Correct pdf.js text-content items before page text, spans and layout are
 * built from them, so every surface reads the same corrected text. Order
 * matters: symbol glyphs are decoded first (later passes compare text),
 * overdrawn copies are dropped before anything is merged, and scripts are
 * attached last, to bases that are already whole.
 */
export function prepareTextItems(items: readonly unknown[], hints: PageFontTextHints = new Map()): unknown[] {
  let prepared = hints.size > 0 ? decodeSymbolFonts(items, hints) : [...items];
  prepared = collapseOverdrawnText(prepared);
  if (hints.size > 0) prepared = removeTrackingSpaces(prepared, hints);
  prepared = joinJustifiedGlyphRuns(prepared);
  prepared = joinBaselineRuns(prepared);
  // An OCR layer's glyph boxes jitter in size and baseline; nothing in them is a script.
  return attachScripts(prepared, (fontName) => hints.get(fontName)?.invisible !== true);
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

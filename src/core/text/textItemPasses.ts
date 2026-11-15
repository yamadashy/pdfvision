import type { PageFontTextHints } from './fontTextHints.js';
import { joinJustifiedGlyphRuns, removeTrackingSpaces } from './letterSpacing.js';
import { collapseOverdrawnText } from './overdraw.js';

/**
 * Correct pdf.js text-content items before page text, spans and layout are
 * built from them, so every surface reads the same corrected text. Order
 * matters: overdrawn copies are dropped before anything is merged.
 */
export function prepareTextItems(items: readonly unknown[], hints: PageFontTextHints = new Map()): unknown[] {
  let prepared = collapseOverdrawnText(items);
  if (hints.size > 0) prepared = removeTrackingSpaces(prepared, hints);
  return joinJustifiedGlyphRuns(prepared);
}

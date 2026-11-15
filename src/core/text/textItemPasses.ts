import { collapseOverdrawnText } from './overdraw.js';

/**
 * Correct pdf.js text-content items before page text, spans and layout are
 * built from them, so every surface reads the same corrected text.
 */
export function prepareTextItems(items: readonly unknown[]): unknown[] {
  return collapseOverdrawnText(items);
}

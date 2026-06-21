import type { TextSpan } from '../../types/index.js';
import { CJK_TIGHT_GAP_RATIO, isCjkLeading } from '../text/cjkJoin.js';
import { shouldInsertSemanticSpace } from '../text/spacing.js';
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
export function joinLineSpans(spans: TextSpan[]): string {
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

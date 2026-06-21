/**
 * Derived page-quality classification. The values are observational —
 * they tell the agent what pdfvision saw, not what the agent should do
 * about it.
 */
export interface PageQuality {
  /**
   * Native-text extraction outcome:
   *   - `ok` — the page has usable native text that is not sparse
   *     relative to non-text visual content.
   *   - `mixed_glyph_indices` — `0.05 <= nonPrintableRatio < 0.3`.
   *     Native text contains readable fragments mixed with raw glyph
   *     codes, so it is not trustworthy as the full human-visible page.
   *   - `unusable_glyph_indices` — `nonPrintableRatio >= 0.3`. pdf.js
   *     returned mostly raw glyph codes (no usable ToUnicode CMap), so
   *     `text` is binary garbage even though `charCount` may look healthy.
   *   - `sparse_text_with_visual_content` — native text exists, but it is
   *     too sparse to explain a visually populated page (often just a page
   *     number, decorative label, large watermark, or thin OCR residue over
   *     images/vectors).
   *   - `sparse_text_on_blank_visual` — native text exists, but the
   *     rendered page is effectively blank. Common in scanned-book front
   *     matter with hidden OCR residue, invisible/broken-font text, or
   *     render/text-layer mismatches.
   *   - `empty_but_visual_content` — `charCount === 0` AND the page has
   *     visual content (`imageCount > 0`, `vectorCount > 0`, a visible
   *     annotation appearance that is not contradicted by a blank render,
   *     or `renderContentRatio` is above the blank threshold when
   *     --render/--ocr ran). Typical of image-flattened slides, scans,
   *     vector-only diagrams / forms, and annotation-only review pages.
   *   - `empty` — `charCount === 0` and no visual content detected.
   *     Likely a genuinely blank page or a render failure (combine with
   *     `visualStatus` to disambiguate).
   */
  nativeTextStatus:
    | 'ok'
    | 'mixed_glyph_indices'
    | 'unusable_glyph_indices'
    | 'sparse_text_on_blank_visual'
    | 'sparse_text_with_visual_content'
    | 'empty_but_visual_content'
    | 'empty';
  /**
   * Rasterisation outcome, present only when `--render` or `--ocr`
   * actually rasterised the page:
   *   - `ok` — `renderContentRatio > 0.005`. The renderer drew
   *     clearly populated content.
   *   - `sparse` — the renderer drew only sparse visible marks, either
   *     `0.001 < renderContentRatio <= 0.005` or a tiny but corroborated
   *     image/vector/annotation trace below the blank threshold.
   *   - `blank` — the page came out
   *     effectively blank against its own dominant background;
   *     typically a render-pipeline failure (unsupported image format,
   *     missing fonts) or a genuinely blank page.
   * Absent when neither `--render` nor `--ocr` triggered a raster.
   */
  visualStatus?: 'ok' | 'sparse' | 'blank';
}

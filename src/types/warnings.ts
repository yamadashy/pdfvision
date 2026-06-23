/**
 * Page anomaly surfaced so agents can spot extraction or visual risks
 * that raw text alone hides: overlapping layout blocks, bodies crowded
 * against chrome, off-page bboxes, localized glyph noise / replacement
 * characters / CJK mojibake,
 * page-wide glyph-index garbage, tiny native text that may not be human-visible,
 * raw embedded producer/source payloads that leak into native text,
 * dense vector graphics whose form fields or chart paths are not text,
 * vector-only visual pages with no native text,
 * raster-dominated pages with no native text,
 * numeric table-like layouts whose rows/columns may flatten into plain text,
 * local math/text-order divergences whose visual order differs from native text,
 * large image regions whose internal labels will not appear in native text,
 * optional-content layer text that may include default-hidden content,
 * OCR-backed scan layers whose bboxes or word boundaries may drift from pixels, etc.
 */
export interface PageWarning {
  /** Machine-readable rule identifier. */
  code:
    | 'text_overlap'
    | 'near_bottom_edge'
    | 'body_near_repeated_chrome'
    | 'off_page'
    | 'glyph_garbage_text'
    | 'localized_glyph_noise'
    | 'font_mapping_warning'
    | 'raw_embedded_source_text'
    | 'dense_vector_graphics'
    | 'vector_graphics_no_native_text'
    | 'raster_image_no_native_text'
    | 'tabular_numeric_layout'
    | 'dot_leader_noise'
    | 'tiny_native_text_noise'
    | 'raster_backed_text_layer'
    | 'raster_text_layer_symbol_noise'
    | 'ocr_low_confidence'
    | 'ocr_native_text_mismatch'
    | 'ocr_native_spacing_loss'
    | 'large_raster_low_text_overlap'
    | 'annotation_text_missing_from_native'
    | 'optional_content_text_may_include_hidden_layers'
    | 'reading_order_divergence';
  /**
   * `'error'` means likely data-integrity issue (off-page bbox usually
   * indicates a broken render or pathological PDF), `'warning'` means
   * a typesetting / readability concern that the extraction still
   * carried through faithfully. Agents typically gate on `severity` to
   * decide whether to surface to the user vs silently log.
   */
  severity: 'warning' | 'error';
  /** Human-readable summary of the rule's findings on this page. */
  message: string;
  /**
   * 0-based index into `page.layout.blocks` for the block the warning
   * primarily refers to. Lets callers highlight the block without
   * re-walking the bbox set. Omitted for warnings that don't pin to a
   * specific block.
   */
  blockIndex?: number;
  /**
   * For pair-wise rules (currently only `text_overlap`), the second
   * block's index. Convention: `blockIndex < otherBlockIndex`.
   */
  otherBlockIndex?: number;
  /**
   * 0-based index into `page.imageBoxes` for warnings that pin to a
   * raster image region. Lets callers re-render or inspect the exact
   * image box without matching by geometry.
   */
  imageBoxIndex?: number;
}

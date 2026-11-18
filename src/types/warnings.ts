/**
 * Page anomaly surfaced so agents can spot extraction or visual risks
 * that raw text alone hides: overlapping layout blocks, bodies crowded
 * against chrome, page-edge text truncation, off-page bboxes, localized glyph noise / replacement
 * characters / CJK mojibake,
 * right-to-left script text whose spacing or paired brackets may degrade,
 * page-wide glyph-index garbage, signs from a symbol font that extract as
 * ordinary characters, tiny native text that may not be human-visible,
 * raw embedded producer/source payloads that leak into native text,
 * text drawn with invisible rendering mode but included in extraction,
 * native text hidden beneath later opaque fills,
 * native text filled in the colour of the paint behind it,
 * native text drawn faint (covered overlay items, watermarks),
 * dense vector graphics whose form fields or chart paths are not text,
 * vector-only visual pages with no native text,
 * hidden duplicate native text layers that inflate page text,
 * raster-dominated pages with no native text,
 * numeric table-like layouts whose rows/columns may flatten into plain text,
 * layout table hints whose cells did not resolve into one consistent grid,
 * local math/text-order divergences whose visual order differs from native text,
 * display math (fractions, matrices) that could not be read onto one line,
 * rotated pages read in their stored orientation because /Rotate would turn their text sideways,
 * large image regions whose internal labels will not appear in native text,
 * optional-content layer text that may include default-hidden content,
 * OCR-backed scan layers whose bboxes or word boundaries may drift from pixels,
 * dynamic XFA (LiveCycle) forms whose extracted pages are only the viewer placeholder,
 * XFA forms whose field layer is real while their page text is not,
 * hybrid XFA forms whose static content is real but whose XFA layer is unread, etc.
 */
export interface PageWarning {
  /** Machine-readable rule identifier. */
  code:
    | 'text_overlap'
    | 'near_bottom_edge'
    | 'body_near_repeated_chrome'
    | 'page_edge_text_truncated'
    | 'off_page'
    | 'glyph_garbage_text'
    | 'rtl_script_text'
    | 'localized_glyph_noise'
    | 'font_mapping_warning'
    | 'symbol_font_substitution'
    | 'raw_embedded_source_text'
    | 'invisible_text'
    | 'text_under_opaque_fill'
    | 'text_matches_background'
    | 'faint_text'
    | 'dense_vector_graphics'
    | 'vector_graphics_no_native_text'
    | 'duplicate_text_layer'
    | 'raster_image_no_native_text'
    | 'tabular_numeric_layout'
    | 'vector_chart_labels'
    | 'display_math_layout'
    | 'layout_table_uncertain'
    | 'dot_leader_noise'
    | 'tiny_native_text_noise'
    | 'raster_backed_text_layer'
    | 'raster_text_layer_symbol_noise'
    | 'raster_text_layer_word_fragmentation'
    | 'ocr_low_confidence'
    | 'ocr_native_text_mismatch'
    | 'ocr_native_spacing_loss'
    | 'large_raster_low_text_overlap'
    | 'text_row_vector_bars'
    | 'annotation_text_missing_from_native'
    | 'optional_content_text_may_include_hidden_layers'
    | 'reading_order_divergence'
    | 'rotated_page_read_unrotated'
    | 'rotated_text_read_upright'
    | 'xfa_form'
    | 'xfa_fields_only'
    | 'xfa_static_content';
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
  /**
   * 0-based index into `page.layout.tables` for warnings about one layout
   * table hint. The table's bbox is the crop to render.
   */
  tableIndex?: number;
}

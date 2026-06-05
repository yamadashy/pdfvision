import type { PageQuality, PageResult } from '../types/index.js';

/**
 * Threshold above which `nonPrintableRatio` is taken to mean that pdf.js
 * returned enough raw glyph codes to make native text incomplete or risky,
 * rather than "occasional control char in otherwise clean text".
 */
const MIXED_NPR_THRESHOLD = 0.05;
/** Above this, the page text is mostly glyph garbage, not just mixed. */
const UNUSABLE_NPR_THRESHOLD = 0.3;
/** Same blank threshold the skill doc publishes for `renderContentRatio`. */
const BLANK_RENDER_THRESHOLD = 0.001;
const SPARSE_VISUAL_TEXT_COVERAGE_THRESHOLD = 0.02;
const SPARSE_VISUAL_TEXT_CHAR_THRESHOLD = 200;

/**
 * Derive PageQuality from the already-extracted signals. Pure function
 * of the raw fields, invoked after OCR/render have had a chance to attach
 * `renderContentRatio`.
 */
export function derivePageQuality(p: PageResult): PageQuality {
  const hasVisualRender = p.renderContentRatio !== undefined && p.renderContentRatio > BLANK_RENDER_THRESHOLD;
  const hasBlankVisualRender = p.renderContentRatio !== undefined && p.renderContentRatio <= BLANK_RENDER_THRESHOLD;
  const hasNonTextVisualContent = p.imageCount > 0 || p.vectorCount > 0;
  const hasVisualContent = hasNonTextVisualContent || hasVisualRender;
  const hasSparseText =
    p.charCount <= SPARSE_VISUAL_TEXT_CHAR_THRESHOLD && p.textCoverage < SPARSE_VISUAL_TEXT_COVERAGE_THRESHOLD;

  let nativeTextStatus: PageQuality['nativeTextStatus'];
  if (p.nonPrintableRatio >= UNUSABLE_NPR_THRESHOLD) {
    nativeTextStatus = 'unusable_glyph_indices';
  } else if (p.nonPrintableRatio >= MIXED_NPR_THRESHOLD) {
    nativeTextStatus = 'mixed_glyph_indices';
  } else if (p.charCount > 0) {
    if (hasBlankVisualRender && hasSparseText) {
      nativeTextStatus = 'sparse_text_on_blank_visual';
    } else if (hasNonTextVisualContent && hasSparseText) {
      nativeTextStatus = 'sparse_text_with_visual_content';
    } else {
      nativeTextStatus = 'ok';
    }
  } else if (hasVisualContent) {
    nativeTextStatus = 'empty_but_visual_content';
  } else {
    nativeTextStatus = 'empty';
  }

  const quality: PageQuality = { nativeTextStatus };
  if (p.renderContentRatio !== undefined) {
    quality.visualStatus = p.renderContentRatio > BLANK_RENDER_THRESHOLD ? 'ok' : 'blank';
  }
  return quality;
}

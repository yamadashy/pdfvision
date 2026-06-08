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
/**
 * Sparse visible marks are not enough to call a page visually populated,
 * but they also must not be collapsed into a render-pipeline blank.
 */
const TRACE_RENDER_THRESHOLD = 0.0005;
const SPARSE_RENDER_THRESHOLD = 0.005;
const SPARSE_VISUAL_TEXT_COVERAGE_THRESHOLD = 0.02;
const SPARSE_VISUAL_TEXT_CHAR_THRESHOLD = 200;

function deriveVisualStatus(p: PageResult): PageQuality['visualStatus'] {
  if (p.renderContentRatio === undefined) return undefined;
  if (p.renderContentRatio > SPARSE_RENDER_THRESHOLD) return 'ok';
  if (p.renderContentRatio > BLANK_RENDER_THRESHOLD) return 'sparse';

  const hasCorroboratingVisualObjects = p.imageCount > 0 || p.vectorCount > 0;
  const hasVisibleTextOnlyTrace = p.charCount > 0 && p.textCoverage > 0 && p.imageCount === 0 && p.vectorCount === 0;
  if (p.renderContentRatio >= TRACE_RENDER_THRESHOLD && (hasCorroboratingVisualObjects || hasVisibleTextOnlyTrace)) {
    return 'sparse';
  }
  return 'blank';
}

/**
 * Derive PageQuality from the already-extracted signals. Pure function
 * of the raw fields, invoked after OCR/render have had a chance to attach
 * `renderContentRatio`.
 */
export function derivePageQuality(p: PageResult): PageQuality {
  const visualStatus = deriveVisualStatus(p);
  const hasVisualRender = visualStatus === 'ok' || visualStatus === 'sparse';
  const hasBlankVisualRender = visualStatus === 'blank';
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
  if (visualStatus !== undefined) quality.visualStatus = visualStatus;
  return quality;
}

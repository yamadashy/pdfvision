import type { ImageBox, PageAnnotation, PageResult, PageWarning, VectorBox } from '../../types/index.js';
import { detectTextOverlap } from '../warningTextOverlap/index.js';
import { detectBodyNearRepeatedChrome, detectNearBottomEdge, detectOffPage } from './edge.js';
import {
  detectFontMappingWarning,
  detectGlyphGarbageText,
  detectLocalizedGlyphNoise,
  detectRawEmbeddedSourceText,
  detectTinyNativeTextNoise,
  hasUnreliableGlyphGeometry,
} from './glyphText.js';
import { detectFormLabelReadingOrderDivergence, detectReadingOrderDivergence } from './readingOrder.js';
import { detectDotLeaderNoise, detectTabularNumericLayout } from './tabular.js';
import {
  detectDenseVectorGraphics,
  detectHighConfidenceOcrNativeMismatch,
  detectHighConfidenceOcrNativeSpacingLoss,
  detectLargeRasterLowTextOverlap,
  detectLowConfidenceOcr,
  detectOptionalContentTextHiddenLayerRisk,
  detectRasterBackedTextLayer,
  detectRasterTextLayerSymbolNoise,
  detectVectorGraphicsWithoutNativeText,
  detectVisibleAnnotationTextMissingFromNative,
} from './visualEvidence.js';

/** Context flags the orchestrator passes to the detector so the
 *  rules can route on facts that the page alone doesn't know. */
export interface PageWarningContext {
  /** True when the cross-page repeated-chrome pass had enough pages
   *  (≥ 2 with layout) to produce meaningful `block.repeated` flags.
   *  Defaults to `true` so unit tests that hand-build pages with
   *  explicit `repeated: true` flags don't have to thread the field
   *  through their helpers. */
  chromeDetectionReliable?: boolean;
  /** True when a full-page raster scan backs a dense text layer. In
   *  that case layout bboxes describe hidden OCR text, not the pixels a
   *  human sees, so geometry-driven warnings are more noise than signal. */
  rasterBackedTextLayer?: boolean;
  /** True when the page text stream contains optional-content marked
   *  text items. */
  optionalContentText?: boolean;
  /** True when the document has at least one hidden optional-content
   *  group in the default viewer state. */
  hasHiddenOptionalContent?: boolean;
  /** Internal raster bboxes used for warnings even when public
   *  `pages[].imageBoxes` was not requested. */
  imageBoxes?: ImageBox[];
  /** Internal vector bboxes used for warnings even when public
   *  `pages[].vectorBoxes` was not requested. */
  vectorBoxes?: VectorBox[];
  /** Internal annotations used for warnings even when public
   *  `pages[].annotations` was not requested. */
  annotations?: PageAnnotation[];
  /** Non-fatal pdf.js warnings captured during parsing/rendering. */
  pdfJsWarnings?: readonly string[];
}

/**
 * Detect geometry-driven layout anomalies on a single page.
 *
 * Runs after `markRepeatedBlocks` so the cross-page chrome detection
 * has already flagged running headers / footers / page numbers — body
 * vs chrome distinctions are routed through `block.repeated`. All
 * rules are pure functions of `page.layout` (+ `page.width`,
 * `page.height`), so the detector can be tested without a real PDF.
 *
 * The rule catalog is intentionally narrow for v1 — the goal is to
 * catch the high-signal cases (the colopl page-13 footer-overlap kind
 * of thing) without firing on every benign layout. New rules should
 * cite a real-world failure mode before being added.
 *
 * Returns an empty array (rather than `undefined`) so callers can
 * uniformly `for (...)` over it. `processor.ts` is responsible for
 * omitting the field from the public output when the array is empty.
 */
export function detectPageWarnings(page: PageResult, context: PageWarningContext = {}): PageWarning[] {
  const warnings: PageWarning[] = [];

  detectGlyphGarbageText(page, warnings);
  detectLocalizedGlyphNoise(page, warnings);
  detectFontMappingWarning(page, context, warnings);
  detectRawEmbeddedSourceText(page, warnings);
  detectRasterBackedTextLayer(page, context, warnings);
  detectRasterTextLayerSymbolNoise(page, context, warnings);
  detectLowConfidenceOcr(page, context, warnings);
  detectHighConfidenceOcrNativeMismatch(page, warnings);
  detectHighConfidenceOcrNativeSpacingLoss(page, context, warnings);
  detectDenseVectorGraphics(page, warnings);
  detectVectorGraphicsWithoutNativeText(page, context, warnings);
  detectLargeRasterLowTextOverlap(page, context, warnings);
  detectVisibleAnnotationTextMissingFromNative(page, context, warnings);
  detectOptionalContentTextHiddenLayerRisk(context, warnings);
  detectDotLeaderNoise(page, warnings);
  detectTinyNativeTextNoise(page, warnings);

  if (
    !page.layout ||
    page.layout.blocks.length === 0 ||
    context.rasterBackedTextLayer ||
    hasUnreliableGlyphGeometry(page)
  ) {
    sortWarnings(warnings);
    return warnings;
  }
  const blocks = page.layout.blocks;
  // Default true: keep the unit tests' hand-built pages (which set
  // `repeated: true` directly on blocks) free to exercise rules
  // without threading the context through every helper.
  const chromeDetectionReliable = context.chromeDetectionReliable !== false;

  detectOffPage(blocks, page.width, page.height, warnings);
  detectTextOverlap(blocks, warnings);
  detectTabularNumericLayout(blocks, warnings);
  detectReadingOrderDivergence(page, blocks, warnings);
  detectFormLabelReadingOrderDivergence(page, blocks, warnings);
  // `near_bottom_edge` only distinguishes body from chrome via the
  // `repeated` flag, which is meaningless when chrome detection
  // didn't run reliably (single-page extraction, or every layout
  // page deselected). Suppress to avoid false positives where a
  // running footer reads as "body crowded against the bottom".
  if (chromeDetectionReliable) {
    detectNearBottomEdge(blocks, page.width, page.height, warnings);
  }
  detectBodyNearRepeatedChrome(blocks, warnings);

  sortWarnings(warnings);
  return warnings;
}

function sortWarnings(warnings: PageWarning[]): void {
  // Stable sort by (severity error first, then code, then blockIndex)
  // so the rendered output is deterministic across runs and easy to
  // diff in tests / golden files.
  warnings.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    const ai = a.blockIndex ?? -1;
    const bi = b.blockIndex ?? -1;
    if (ai !== bi) return ai - bi;
    const aImage = a.imageBoxIndex ?? -1;
    const bImage = b.imageBoxIndex ?? -1;
    return aImage - bImage;
  });
}

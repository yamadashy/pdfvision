import type { ImageBox, PageResult, PageWarning, VectorBox } from '../types/index.js';
import { detectBodyNearRepeatedChrome, detectNearBottomEdge, detectOffPage } from './warnings/edge.js';
import {
  detectFontMappingWarning,
  detectGlyphGarbageText,
  detectLocalizedGlyphNoise,
  detectTinyNativeTextNoise,
  hasUnreliableGlyphGeometry,
} from './warnings/glyphText.js';
import { detectFormLabelReadingOrderDivergence, detectReadingOrderDivergence } from './warnings/readingOrder.js';
import { detectDotLeaderNoise, detectTabularNumericLayout } from './warnings/tabular.js';
import { shortTextSample } from './warnings/textSamples.js';
import { detectTextOverlap } from './warningTextOverlap.js';

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
  detectRasterBackedTextLayer(page, context, warnings);
  detectRasterTextLayerSymbolNoise(page, context, warnings);
  detectLowConfidenceOcr(page, context, warnings);
  detectHighConfidenceOcrNativeMismatch(page, warnings);
  detectDenseVectorGraphics(page, warnings);
  detectVectorGraphicsWithoutNativeText(page, context, warnings);
  detectLargeRasterLowTextOverlap(page, context, warnings);
  detectVisibleAnnotationTextMissingFromNative(page, warnings);
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

const DENSE_VECTOR_GRAPHICS_COUNT_THRESHOLD = 250;
const EDGE_HAIRLINE_MAX_THICKNESS = 1.5;
const EDGE_HAIRLINE_MARGIN_RATIO = 0.01;
const EDGE_HAIRLINE_MIN_MARGIN = 2;
const LARGE_RASTER_AREA_RATIO_THRESHOLD = 0.2;
const AGGREGATE_RASTER_AREA_RATIO_THRESHOLD = 0.2;
const AGGREGATE_RASTER_TILE_MIN_AREA_RATIO = 0.02;
const LARGE_RASTER_TEXT_OVERLAP_RATIO_THRESHOLD = 0.01;
const LOW_CONFIDENCE_OCR_THRESHOLD = 0.5;
const OCR_NATIVE_MISMATCH_MIN_CONFIDENCE = 0.85;
const OCR_NATIVE_MISMATCH_MIN_CHARS = 3;
const OCR_NATIVE_MISMATCH_MAX_CHARS = 200;
const OCR_NATIVE_MISMATCH_MIN_LENGTH_RATIO = 0.75;
const OCR_NATIVE_MISMATCH_DISTANCE_RATIO_THRESHOLD = 0.5;
const RASTER_TEXT_LAYER_SYMBOL_NOISE_MIN_CHARS = 80;
const RASTER_TEXT_LAYER_SYMBOL_NOISE_RATIO_THRESHOLD = 0.35;

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

function detectRasterBackedTextLayer(page: PageResult, context: PageWarningContext, out: PageWarning[]): void {
  if (!context.rasterBackedTextLayer) return;
  out.push({
    code: 'raster_backed_text_layer',
    severity: 'warning',
    message: `native text appears to be an OCR/text layer over a full-page raster image (textCoverage ${(page.textCoverage * 100).toFixed(1)}%, imageCount ${page.imageCount}) — text may be useful, but may contain OCR recognition errors, and bboxes/layout can drift from the pixels a human sees`,
  });
}

function detectRasterTextLayerSymbolNoise(page: PageResult, context: PageWarningContext, out: PageWarning[]): void {
  if (!context.rasterBackedTextLayer) return;
  if (page.quality.nativeTextStatus !== 'ok') return;
  const stats = printableSymbolNoiseStats(page.text);
  if (stats.total < RASTER_TEXT_LAYER_SYMBOL_NOISE_MIN_CHARS) return;
  if (stats.ratio < RASTER_TEXT_LAYER_SYMBOL_NOISE_RATIO_THRESHOLD) return;

  out.push({
    code: 'raster_text_layer_symbol_noise',
    severity: 'warning',
    message: `raster-backed native text is ${(stats.ratio * 100).toFixed(1)}% printable symbols/punctuation (samples: ${stats.samples.map((sample) => JSON.stringify(sample)).join(', ')}) — likely noisy OCR text over a scan; compare against the render before trusting the native text`,
  });
}

function printableSymbolNoiseStats(text: string): {
  total: number;
  symbolCount: number;
  ratio: number;
  samples: string[];
} {
  let total = 0;
  let symbolCount = 0;
  const samples: string[] = [];
  for (const char of text) {
    if (/\s/u.test(char)) continue;
    total++;
    if (/[\p{Letter}\p{Number}]/u.test(char)) continue;
    symbolCount++;
    if (samples.length < 6 && !samples.includes(char)) samples.push(char);
  }
  return { total, symbolCount, ratio: total > 0 ? symbolCount / total : 0, samples };
}

function detectLowConfidenceOcr(page: PageResult, context: PageWarningContext, out: PageWarning[]): void {
  if (!page.ocr) return;
  if (page.ocr.confidence >= LOW_CONFIDENCE_OCR_THRESHOLD) return;
  if (page.quality.visualStatus === 'blank') return;
  const nativeNeedsOcr = nativeExtractionNeedsOcr(page.quality.nativeTextStatus);
  if (!nativeNeedsOcr && !context.rasterBackedTextLayer) return;

  const nativeContext = nativeNeedsOcr
    ? `while native text is ${page.quality.nativeTextStatus}`
    : 'on a raster-backed text layer';

  out.push({
    code: 'ocr_low_confidence',
    severity: 'warning',
    message: `OCR confidence is ${(page.ocr.confidence * 100).toFixed(1)}% ${nativeContext} — compare against the render before trusting recognized text or form labels`,
  });
}

function detectHighConfidenceOcrNativeMismatch(page: PageResult, out: PageWarning[]): void {
  if (!page.ocr) return;
  if (page.ocr.confidence < OCR_NATIVE_MISMATCH_MIN_CONFIDENCE) return;
  if (page.quality.nativeTextStatus !== 'ok') return;
  if (page.quality.visualStatus === 'blank') return;

  const native = normalizeComparableText(page.text);
  const ocr = normalizeComparableText(page.ocr.text);
  const maxLength = Math.max(native.length, ocr.length);
  if (maxLength < OCR_NATIVE_MISMATCH_MIN_CHARS || maxLength > OCR_NATIVE_MISMATCH_MAX_CHARS) return;
  if (native === ocr) return;
  const minLength = Math.min(native.length, ocr.length);
  if (minLength / maxLength < OCR_NATIVE_MISMATCH_MIN_LENGTH_RATIO) return;

  const distanceRatio = levenshteinDistance(native, ocr) / maxLength;
  if (distanceRatio < OCR_NATIVE_MISMATCH_DISTANCE_RATIO_THRESHOLD) return;

  out.push({
    code: 'ocr_native_text_mismatch',
    severity: 'warning',
    message: `high-confidence OCR text (${JSON.stringify(shortTextSample(page.ocr.text))}, ${(page.ocr.confidence * 100).toFixed(1)}%) differs from native text (${JSON.stringify(shortTextSample(page.text))}) — native text may be a printable glyph substitution; compare against the render before trusting exact text`,
  });
}

function detectVisibleAnnotationTextMissingFromNative(page: PageResult, out: PageWarning[]): void {
  const annotations =
    page.annotations?.filter((annotation) => {
      if (annotation.subtype !== 'FreeText') return false;
      if (annotation.hasAppearance !== true) return false;
      if (!annotation.contents?.trim()) return false;
      return !annotation.flags?.some((flag) => flag === 'hidden' || flag === 'invisible' || flag === 'noView');
    }) ?? [];
  if (annotations.length === 0) return;

  const nativeText = normalizeComparableText(page.text);
  const missing = annotations.filter((annotation) => {
    const contents = normalizeComparableText(annotation.contents ?? '');
    return contents.length > 0 && !nativeText.includes(contents);
  });
  if (missing.length === 0) return;

  const sample = shortTextSample(missing[0]?.contents ?? '');
  out.push({
    code: 'annotation_text_missing_from_native',
    severity: 'warning',
    message: `${missing.length} visible FreeText annotation${missing.length === 1 ? '' : 's'} ${missing.length === 1 ? 'is' : 'are'} not present in native page text (sample: ${JSON.stringify(sample)}) — read pages[].annotations or search annotation matches before trusting pages[].text as the full visible text`,
  });
}

function detectOptionalContentTextHiddenLayerRisk(context: PageWarningContext, out: PageWarning[]): void {
  if (!context.optionalContentText || !context.hasHiddenOptionalContent) return;
  out.push({
    code: 'optional_content_text_may_include_hidden_layers',
    severity: 'warning',
    message:
      'page text contains optional-content marked text while the PDF has hidden layers; native text may include layer content that is not visible in the default viewer state, so inspect --layers or a render before trusting the text',
  });
}

function normalizeComparableText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function levenshteinDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 0; i < a.length; i++) {
    current[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const substitution = previous[j] + (a[i] === b[j] ? 0 : 1);
      current[j + 1] = Math.min(previous[j + 1] + 1, current[j] + 1, substitution);
    }
    for (let j = 0; j < previous.length; j++) previous[j] = current[j];
  }
  return previous[b.length] ?? 0;
}

function nativeExtractionNeedsOcr(status: PageResult['quality']['nativeTextStatus']): boolean {
  return (
    status === 'empty_but_visual_content' ||
    status === 'sparse_text_with_visual_content' ||
    status === 'mixed_glyph_indices' ||
    status === 'unusable_glyph_indices'
  );
}

function detectDenseVectorGraphics(page: PageResult, out: PageWarning[]): void {
  if (page.vectorCount < DENSE_VECTOR_GRAPHICS_COUNT_THRESHOLD) return;
  out.push({
    code: 'dense_vector_graphics',
    severity: 'warning',
    message: `page contains ${page.vectorCount} vector drawing operations — form fields, table rules, chart paths, or diagrams may not be represented in native text; inspect the render if visual structure matters`,
  });
}

function detectVectorGraphicsWithoutNativeText(
  page: PageResult,
  context: PageWarningContext,
  out: PageWarning[],
): void {
  if (page.vectorCount <= 0) return;
  if (page.imageCount > 0) return;
  if (page.charCount > 0) return;
  if (page.quality.nativeTextStatus !== 'empty_but_visual_content') return;
  if (page.quality.visualStatus === 'blank') return;
  const vectorBoxes = page.vectorBoxes ?? context.vectorBoxes;
  if (vectorBoxes && vectorBoxes.length > 0 && vectorBoxes.every((box) => isPageEdgeHairline(box, page))) return;
  out.push({
    code: 'vector_graphics_no_native_text',
    severity: 'warning',
    message: `page contains ${page.vectorCount} vector drawing operation${page.vectorCount === 1 ? '' : 's'} but no native text — labels, symbols, or diagrams drawn as paths will not appear in pages[].text; inspect --render, --vector-boxes, or --visual-regions if visual content matters`,
  });
}

function isPageEdgeHairline(box: VectorBox, page: Pick<PageResult, 'width' | 'height'>): boolean {
  if (box.width <= 0 || box.height <= 0 || page.width <= 0 || page.height <= 0) return false;
  const thickness = Math.min(box.width, box.height);
  if (thickness > EDGE_HAIRLINE_MAX_THICKNESS) return false;

  const edgeMargin = Math.max(EDGE_HAIRLINE_MIN_MARGIN, Math.min(page.width, page.height) * EDGE_HAIRLINE_MARGIN_RATIO);
  const nearTop = box.y <= edgeMargin;
  const nearBottom = box.y + box.height >= page.height - edgeMargin;
  const nearLeft = box.x <= edgeMargin;
  const nearRight = box.x + box.width >= page.width - edgeMargin;

  if (box.height <= EDGE_HAIRLINE_MAX_THICKNESS) return nearTop || nearBottom;
  if (box.width <= EDGE_HAIRLINE_MAX_THICKNESS) return nearLeft || nearRight;
  return false;
}

function detectLargeRasterLowTextOverlap(page: PageResult, context: PageWarningContext, out: PageWarning[]): void {
  const imageBoxes = page.imageBoxes ?? context.imageBoxes;
  if (!imageBoxes || imageBoxes.length === 0) return;
  if (!canCompareNativeTextAgainstRaster(page.quality.nativeTextStatus)) return;
  const pageArea = page.width * page.height;
  if (pageArea <= 0) return;

  const textBoxes = page.layout?.blocks ?? page.spans ?? [];
  if (textBoxes.length === 0 && !hasNoOrSparseNativeText(page.quality.nativeTextStatus)) return;
  const exposeImageBoxIndex = page.imageBoxes !== undefined;
  const warnedImages: BoxLike[] = [];
  for (let i = 0; i < imageBoxes.length; i++) {
    const image = imageBoxes[i];
    if (warnedImages.some((warned) => overlapRatio(image, warned) >= 0.95)) continue;
    const imageArea = clippedArea(image, { x: 0, y: 0, width: page.width, height: page.height });
    const imageAreaRatio = imageArea / pageArea;
    if (imageAreaRatio < LARGE_RASTER_AREA_RATIO_THRESHOLD) continue;

    const textOverlap = textBoxes.reduce((sum, box) => sum + clippedArea(box, image), 0);
    const textOverlapRatio = imageArea > 0 ? textOverlap / imageArea : 0;
    if (textOverlapRatio >= LARGE_RASTER_TEXT_OVERLAP_RATIO_THRESHOLD) continue;

    const message =
      textBoxes.length > 0
        ? `large raster image covers ${(imageAreaRatio * 100).toFixed(1)}% of the page with little native-text overlap (${(textOverlapRatio * 100).toFixed(2)}%) — labels, chart text, or map text inside the image will not appear in native text`
        : `large raster image covers ${(imageAreaRatio * 100).toFixed(1)}% of the page while native text is ${page.quality.nativeTextStatus === 'empty_but_visual_content' ? 'empty' : 'sparse'} — labels, chart text, or map text inside the image will not appear in native text`;
    out.push({
      code: 'large_raster_low_text_overlap',
      severity: 'warning',
      message,
      ...(exposeImageBoxIndex && { imageBoxIndex: i }),
    });
    warnedImages.push(image);
  }
  if (warnedImages.length === 0) {
    detectAggregateRasterLowTextOverlap(page, imageBoxes, textBoxes, pageArea, out);
  }
}

function detectAggregateRasterLowTextOverlap(
  page: PageResult,
  imageBoxes: readonly BoxLike[],
  textBoxes: readonly BoxLike[],
  pageArea: number,
  out: PageWarning[],
): void {
  const candidates: BoxLike[] = [];
  for (const image of imageBoxes) {
    const imageArea = clippedArea(image, { x: 0, y: 0, width: page.width, height: page.height });
    const imageAreaRatio = imageArea / pageArea;
    if (imageAreaRatio < AGGREGATE_RASTER_TILE_MIN_AREA_RATIO) continue;
    if (candidates.some((candidate) => overlapRatio(image, candidate) >= 0.95)) continue;
    candidates.push(image);
  }
  if (candidates.length < 2) return;

  const aggregateArea = candidates.reduce(
    (sum, image) => sum + clippedArea(image, { x: 0, y: 0, width: page.width, height: page.height }),
    0,
  );
  const aggregateAreaRatio = aggregateArea / pageArea;
  if (aggregateAreaRatio < AGGREGATE_RASTER_AREA_RATIO_THRESHOLD) return;

  const textOverlap = candidates.reduce(
    (sum, image) => sum + textBoxes.reduce((boxSum, box) => boxSum + clippedArea(box, image), 0),
    0,
  );
  const textOverlapRatio = aggregateArea > 0 ? textOverlap / aggregateArea : 0;
  if (textOverlapRatio >= LARGE_RASTER_TEXT_OVERLAP_RATIO_THRESHOLD) return;

  const nativeText = page.quality.nativeTextStatus === 'empty_but_visual_content' ? 'empty' : 'sparse';
  const textContext =
    textBoxes.length > 0
      ? `with little native-text overlap (${(textOverlapRatio * 100).toFixed(2)}%)`
      : `while native text is ${nativeText}`;
  out.push({
    code: 'large_raster_low_text_overlap',
    severity: 'warning',
    message: `${candidates.length} raster images together cover ${(aggregateAreaRatio * 100).toFixed(1)}% of the page ${textContext} — labels, chart text, map text, or drawing text inside the images will not appear in native text`,
  });
}

function canCompareNativeTextAgainstRaster(status: PageResult['quality']['nativeTextStatus']): boolean {
  return status === 'ok' || hasNoOrSparseNativeText(status);
}

function hasNoOrSparseNativeText(status: PageResult['quality']['nativeTextStatus']): boolean {
  return status === 'empty_but_visual_content' || status === 'sparse_text_with_visual_content';
}

interface BoxLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clippedArea(a: BoxLike, b: BoxLike): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function overlapRatio(a: BoxLike, b: BoxLike): number {
  const areaA = Math.max(0, a.width) * Math.max(0, a.height);
  const areaB = Math.max(0, b.width) * Math.max(0, b.height);
  const denominator = Math.min(areaA, areaB);
  if (denominator <= 0) return 0;
  return clippedArea(a, b) / denominator;
}

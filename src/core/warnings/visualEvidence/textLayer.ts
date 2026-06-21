import type { PageResult, PageWarning } from '../../../types/index.js';
import { shortTextSample } from '../textSamples.js';
import { levenshteinDistance, normalizeComparableText } from './textComparison.js';
import type { VisualWarningContext } from './types.js';

const LOW_CONFIDENCE_OCR_THRESHOLD = 0.5;
const OCR_NATIVE_MISMATCH_MIN_CONFIDENCE = 0.85;
const OCR_NATIVE_MISMATCH_MIN_CHARS = 3;
const OCR_NATIVE_MISMATCH_MAX_CHARS = 200;
const OCR_NATIVE_MISMATCH_MIN_LENGTH_RATIO = 0.75;
const OCR_NATIVE_MISMATCH_DISTANCE_RATIO_THRESHOLD = 0.5;
const RASTER_TEXT_LAYER_SYMBOL_NOISE_MIN_CHARS = 80;
const RASTER_TEXT_LAYER_SYMBOL_NOISE_RATIO_THRESHOLD = 0.35;

export function detectRasterBackedTextLayer(page: PageResult, context: VisualWarningContext, out: PageWarning[]): void {
  if (!context.rasterBackedTextLayer) return;
  out.push({
    code: 'raster_backed_text_layer',
    severity: 'warning',
    message: `native text appears to be an OCR/text layer over a full-page raster image (textCoverage ${(page.textCoverage * 100).toFixed(1)}%, imageCount ${page.imageCount}) — text may be useful, but may contain OCR recognition errors, and bboxes/layout can drift from the pixels a human sees`,
  });
}

export function detectRasterTextLayerSymbolNoise(
  page: PageResult,
  context: VisualWarningContext,
  out: PageWarning[],
): void {
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

export function detectLowConfidenceOcr(page: PageResult, context: VisualWarningContext, out: PageWarning[]): void {
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

export function detectHighConfidenceOcrNativeMismatch(page: PageResult, out: PageWarning[]): void {
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

function nativeExtractionNeedsOcr(status: PageResult['quality']['nativeTextStatus']): boolean {
  return (
    status === 'empty_but_visual_content' ||
    status === 'sparse_text_with_visual_content' ||
    status === 'mixed_glyph_indices' ||
    status === 'unusable_glyph_indices'
  );
}

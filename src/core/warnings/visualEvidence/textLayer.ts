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
const OCR_NATIVE_SPACING_MIN_CONFIDENCE = 0.85;
const OCR_NATIVE_SPACING_MIN_CHARS = 120;
const OCR_NATIVE_SPACING_MIN_LENGTH_RATIO = 0.75;
const OCR_NATIVE_SPACING_MAX_DISTANCE_RATIO = 0.12;
const OCR_NATIVE_SPACING_MIN_OCR_WHITESPACE_RATIO = 0.14;
const OCR_NATIVE_SPACING_MAX_NATIVE_RATIO_OF_OCR = 0.6;
const OCR_NATIVE_SPACING_MIN_NATIVE_AVG_TOKEN = 8;
const OCR_NATIVE_SPACING_MAX_OCR_AVG_TOKEN = 7;
const OCR_NATIVE_SPACING_MAX_NATIVE_RUN_RATIO_OF_OCR = 0.65;
const RASTER_TEXT_LAYER_SYMBOL_NOISE_MIN_CHARS = 80;
const RASTER_TEXT_LAYER_SYMBOL_NOISE_RATIO_THRESHOLD = 0.35;
const RASTER_TEXT_LAYER_FRAGMENTATION_MIN_TOKENS = 80;
const RASTER_TEXT_LAYER_FRAGMENTATION_SINGLE_RATIO_THRESHOLD = 0.22;
const RASTER_TEXT_LAYER_FRAGMENTATION_SHORT_RATIO_THRESHOLD = 0.42;
const RASTER_TEXT_LAYER_FRAGMENTATION_FRAGMENT_RUN_THRESHOLD = 2;

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

export function detectRasterTextLayerWordFragmentation(
  page: PageResult,
  context: VisualWarningContext,
  out: PageWarning[],
): void {
  if (!context.rasterBackedTextLayer) return;
  if (page.quality.nativeTextStatus !== 'ok') return;
  if (page.quality.visualStatus === 'blank') return;
  const stats = wordFragmentationStats(page.text);
  if (stats.tokenCount < RASTER_TEXT_LAYER_FRAGMENTATION_MIN_TOKENS) return;
  if (stats.singleLatinRatio < RASTER_TEXT_LAYER_FRAGMENTATION_SINGLE_RATIO_THRESHOLD) return;
  if (stats.shortTokenRatio < RASTER_TEXT_LAYER_FRAGMENTATION_SHORT_RATIO_THRESHOLD) return;
  if (stats.fragmentRuns.length < RASTER_TEXT_LAYER_FRAGMENTATION_FRAGMENT_RUN_THRESHOLD) return;

  out.push({
    code: 'raster_text_layer_word_fragmentation',
    severity: 'warning',
    message: `raster-backed native text has many isolated Latin-letter fragments (${(stats.singleLatinRatio * 100).toFixed(1)}% single-letter tokens; samples: ${stats.fragmentRuns.map((sample) => JSON.stringify(sample)).join(', ')}) — likely noisy OCR text over a scan; use --ocr or compare against the render before relying on exact wording or search misses`,
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

export function detectHighConfidenceOcrNativeSpacingLoss(
  page: PageResult,
  context: VisualWarningContext,
  out: PageWarning[],
): void {
  if (!context.rasterBackedTextLayer) return;
  if (!page.ocr) return;
  if (page.ocr.confidence < OCR_NATIVE_SPACING_MIN_CONFIDENCE) return;
  if (page.quality.nativeTextStatus !== 'ok') return;
  if (page.quality.visualStatus === 'blank') return;

  const native = normalizeComparableText(page.text);
  const ocr = normalizeComparableText(page.ocr.text);
  const maxLength = Math.max(native.length, ocr.length);
  if (maxLength < OCR_NATIVE_SPACING_MIN_CHARS) return;
  const minLength = Math.min(native.length, ocr.length);
  if (minLength / maxLength < OCR_NATIVE_SPACING_MIN_LENGTH_RATIO) return;
  if (levenshteinDistance(native, ocr) / maxLength > OCR_NATIVE_SPACING_MAX_DISTANCE_RATIO) return;

  const nativeStats = wordSpacingStats(page.text);
  const ocrStats = wordSpacingStats(page.ocr.text);
  if (nativeStats.alnumCount < OCR_NATIVE_SPACING_MIN_CHARS || ocrStats.alnumCount < OCR_NATIVE_SPACING_MIN_CHARS) {
    return;
  }
  if (ocrStats.whitespaceRatio < OCR_NATIVE_SPACING_MIN_OCR_WHITESPACE_RATIO) return;
  if (nativeStats.whitespaceRatio > ocrStats.whitespaceRatio * OCR_NATIVE_SPACING_MAX_NATIVE_RATIO_OF_OCR) return;
  if (nativeStats.averageTokenLength < OCR_NATIVE_SPACING_MIN_NATIVE_AVG_TOKEN) return;
  if (ocrStats.averageTokenLength > OCR_NATIVE_SPACING_MAX_OCR_AVG_TOKEN) return;
  if (nativeStats.wordRuns > ocrStats.wordRuns * OCR_NATIVE_SPACING_MAX_NATIVE_RUN_RATIO_OF_OCR) return;

  out.push({
    code: 'ocr_native_spacing_loss',
    severity: 'warning',
    message: `high-confidence OCR preserves word spacing better than raster-backed native text (native avg token ${nativeStats.averageTokenLength.toFixed(1)} chars, whitespace ${(nativeStats.whitespaceRatio * 100).toFixed(1)}%; OCR avg token ${ocrStats.averageTokenLength.toFixed(1)} chars, whitespace ${(ocrStats.whitespaceRatio * 100).toFixed(1)}%) — native text likely lost word boundaries; compare against OCR text and the render when exact wording matters`,
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

function wordFragmentationStats(text: string): {
  tokenCount: number;
  singleLatinRatio: number;
  shortTokenRatio: number;
  fragmentRuns: string[];
} {
  const tokens = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (tokens.length === 0) {
    return { tokenCount: 0, singleLatinRatio: 0, shortTokenRatio: 0, fragmentRuns: [] };
  }
  const singleLatinCount = tokens.filter((token) => /^[A-Za-z]$/u.test(token)).length;
  const shortTokenCount = tokens.filter((token) => /^[A-Za-z0-9]{1,2}$/u.test(token)).length;
  const fragmentRuns = Array.from(text.matchAll(/(?:\b[A-Za-z]\b\W+){2,}\b[A-Za-z]\b/gu))
    .map((match) => match[0].replace(/\s+/g, ' ').trim())
    .filter((sample, index, samples) => sample.length > 0 && samples.indexOf(sample) === index)
    .slice(0, 4);
  return {
    tokenCount: tokens.length,
    singleLatinRatio: singleLatinCount / tokens.length,
    shortTokenRatio: shortTokenCount / tokens.length,
    fragmentRuns,
  };
}

function wordSpacingStats(text: string): {
  alnumCount: number;
  whitespaceCount: number;
  whitespaceRatio: number;
  wordRuns: number;
  averageTokenLength: number;
} {
  let alnumCount = 0;
  let whitespaceCount = 0;
  for (const char of text) {
    if (/[\p{L}\p{N}]/u.test(char)) alnumCount++;
    else if (/\s/u.test(char)) whitespaceCount++;
  }
  const wordRuns = text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  return {
    alnumCount,
    whitespaceCount,
    whitespaceRatio: alnumCount > 0 ? whitespaceCount / alnumCount : 0,
    wordRuns,
    averageTokenLength: wordRuns > 0 ? alnumCount / wordRuns : 0,
  };
}

function nativeExtractionNeedsOcr(status: PageResult['quality']['nativeTextStatus']): boolean {
  return (
    status === 'empty_but_visual_content' ||
    status === 'sparse_text_with_visual_content' ||
    status === 'mixed_glyph_indices' ||
    status === 'unusable_glyph_indices'
  );
}

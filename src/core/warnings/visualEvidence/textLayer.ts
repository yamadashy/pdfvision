import type { PageResult, PageWarning } from '../../../types/index.js';
import { isLowContentFullPageRasterScan } from './lowContentRaster.js';
import type { VisualWarningContext } from './types.js';

const LOW_CONFIDENCE_OCR_THRESHOLD = 0.5;
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
    message: `native text appears to be an OCR/text layer over a full-page raster image (textCoverage ${(page.textCoverage * 100).toFixed(1)}%, imageCount ${page.imageCount}) — text may be useful, but exact search can miss visible words when OCR recognition is wrong; rerun with --ocr or compare against the render before trusting wording, bboxes, or layout`,
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
  if (isLowContentFullPageRasterScan(page, page.imageBoxes ?? context.imageBoxes)) return;
  if (page.quality.visualStatus === 'blank') {
    if (page.ocr.text.trim().length === 0) return;
    out.push({
      code: 'ocr_low_confidence',
      severity: 'warning',
      message: `OCR produced low-confidence text on a blank render (${(page.ocr.confidence * 100).toFixed(1)}%) — treat recognized text as likely scan noise unless the rendered page shows real content`,
    });
    return;
  }
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

function nativeExtractionNeedsOcr(status: PageResult['quality']['nativeTextStatus']): boolean {
  return (
    status === 'empty_but_visual_content' ||
    status === 'sparse_text_with_visual_content' ||
    status === 'mixed_glyph_indices' ||
    status === 'unusable_glyph_indices'
  );
}

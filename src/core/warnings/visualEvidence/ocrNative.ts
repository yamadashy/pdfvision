import type { PageResult, PageWarning } from '../../../types/index.js';
import { shortTextSample } from '../textSamples.js';
import { levenshteinDistance, normalizeComparableText } from './textComparison.js';
import type { VisualWarningContext } from './types.js';

const OCR_NATIVE_MISMATCH_MIN_CONFIDENCE = 0.85;
const OCR_NATIVE_MISMATCH_MIN_CHARS = 3;
const OCR_NATIVE_MISMATCH_MAX_CHARS = 200;
const OCR_NATIVE_MISMATCH_MIN_LENGTH_RATIO = 0.75;
const OCR_NATIVE_MISMATCH_DISTANCE_RATIO_THRESHOLD = 0.5;
const OCR_NATIVE_WORD_MISMATCH_MIN_CONFIDENCE = 0.9;
const OCR_NATIVE_WORD_MISMATCH_MIN_CHARS = 5;
const OCR_NATIVE_WORD_MISMATCH_MIN_LENGTH_RATIO = 0.75;
const OCR_NATIVE_WORD_MISMATCH_DISTANCE_RATIO_THRESHOLD = 0.45;
const OCR_NATIVE_WORD_MISMATCH_MAX_SAMPLES = 3;
const OCR_NATIVE_SPACING_MIN_CONFIDENCE = 0.85;
const OCR_NATIVE_SPACING_MIN_CHARS = 120;
const OCR_NATIVE_SPACING_MIN_LENGTH_RATIO = 0.75;
const OCR_NATIVE_SPACING_MAX_DISTANCE_RATIO = 0.12;
const OCR_NATIVE_SPACING_MIN_OCR_WHITESPACE_RATIO = 0.14;
const OCR_NATIVE_SPACING_MAX_NATIVE_RATIO_OF_OCR = 0.6;
const OCR_NATIVE_SPACING_MIN_NATIVE_AVG_TOKEN = 8;
const OCR_NATIVE_SPACING_MAX_OCR_AVG_TOKEN = 7;
const OCR_NATIVE_SPACING_MAX_NATIVE_RUN_RATIO_OF_OCR = 0.65;

interface WordMismatch {
  ocrText: string;
  ocrConfidence: number;
  nativeText: string;
}

export function detectHighConfidenceOcrNativeMismatch(
  page: PageResult,
  context: VisualWarningContext,
  out: PageWarning[],
): void {
  if (!page.ocr) return;
  if (page.quality.nativeTextStatus !== 'ok') return;
  if (page.quality.visualStatus === 'blank') return;

  if (context.rasterBackedTextLayer) {
    const wordMismatches = highConfidenceWordMismatches(page);
    if (wordMismatches.length > 0) {
      out.push({
        code: 'ocr_native_text_mismatch',
        severity: 'warning',
        message: `high-confidence OCR words differ from nearest native tokens on a raster-backed text layer (${wordMismatches.map(formatWordMismatch).join('; ')}) — exact native search may miss visible words; rerun with --ocr or compare against the render before trusting exact text`,
      });
      return;
    }
  }

  if (page.ocr.confidence < OCR_NATIVE_MISMATCH_MIN_CONFIDENCE) return;

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

function highConfidenceWordMismatches(page: PageResult): WordMismatch[] {
  const words = page.ocr?.words ?? [];
  if (words.length === 0) return [];
  const nativeTokens = comparableTokens(page.text);
  if (nativeTokens.length === 0) return [];
  const exactNativeTokens = new Set(nativeTokens.map((token) => token.normalized));
  const out: WordMismatch[] = [];

  for (const word of words) {
    if (word.confidence < OCR_NATIVE_WORD_MISMATCH_MIN_CONFIDENCE) continue;
    const ocrToken = normalizeComparableText(word.text);
    if (ocrToken.length < OCR_NATIVE_WORD_MISMATCH_MIN_CHARS) continue;
    if (exactNativeTokens.has(ocrToken)) continue;

    const nativeMatch = nearestNativeToken(ocrToken, nativeTokens);
    if (!nativeMatch) continue;
    out.push({
      ocrText: word.text,
      ocrConfidence: word.confidence,
      nativeText: nativeMatch.raw,
    });
    if (out.length >= OCR_NATIVE_WORD_MISMATCH_MAX_SAMPLES) break;
  }

  return out;
}

function comparableTokens(text: string): Array<{ raw: string; normalized: string }> {
  const tokens = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens
    .map((raw) => ({ raw, normalized: normalizeComparableText(raw) }))
    .filter((token) => token.normalized.length >= OCR_NATIVE_WORD_MISMATCH_MIN_CHARS);
}

function nearestNativeToken(
  ocrToken: string,
  nativeTokens: Array<{ raw: string; normalized: string }>,
): { raw: string; distanceRatio: number } | undefined {
  let best: { raw: string; distanceRatio: number } | undefined;
  for (const nativeToken of nativeTokens) {
    const maxLength = Math.max(ocrToken.length, nativeToken.normalized.length);
    const minLength = Math.min(ocrToken.length, nativeToken.normalized.length);
    if (minLength / maxLength < OCR_NATIVE_WORD_MISMATCH_MIN_LENGTH_RATIO) continue;

    const distance = levenshteinDistance(ocrToken, nativeToken.normalized);
    if (distance === 0) continue;
    const distanceRatio = distance / maxLength;
    if (distanceRatio > OCR_NATIVE_WORD_MISMATCH_DISTANCE_RATIO_THRESHOLD) continue;
    if (!best || distanceRatio < best.distanceRatio) best = { raw: nativeToken.raw, distanceRatio };
  }
  return best;
}

function formatWordMismatch(sample: WordMismatch): string {
  return `${JSON.stringify(sample.ocrText)} ${(sample.ocrConfidence * 100).toFixed(1)}% vs native ${JSON.stringify(sample.nativeText)}`;
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

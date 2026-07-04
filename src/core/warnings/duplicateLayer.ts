import type { PageResult, PageWarning, TextSpan } from '../../types/index.js';

const MIN_NORMALIZED_TEXT_LENGTH = 6;
const MIN_VERTICAL_SEPARATION_PT = 20;
const MIN_DISTINCT_TEXTS = 3;
const MIN_FONT_SIZE_RELATIVE_DIFF = 0.02;
const MIN_SOURCE_Y_SPREAD_PT = 30;
const MIN_PAGE_TEXT_VOLUME_RATIO = 0.1;
const MIN_AFFINE_SCALE = 0.5;
const MAX_AFFINE_SCALE = 1.5;
const MAX_AFFINE_RESIDUAL_PT = 4;

interface SpanCandidate {
  span: TextSpan;
  index: number;
  text: string;
}

interface DuplicatePair {
  text: string;
  upper: SpanCandidate;
  lower: SpanCandidate;
  y1: number;
  y2: number;
}

interface AffineFit {
  scale: number;
  offset: number;
  maxResidual: number;
}

interface DuplicateLayerEvidence {
  pairs: DuplicatePair[];
  fit: AffineFit;
  duplicateChars: number;
  pageChars: number;
}

interface DuplicateLayerWarningContext {
  rasterBackedTextLayer?: boolean;
  spans?: readonly TextSpan[];
}

export function detectDuplicateTextLayer(
  page: PageResult,
  context: DuplicateLayerWarningContext,
  out: PageWarning[],
): void {
  if (context.rasterBackedTextLayer) return;
  const spans = page.spans ?? context.spans;
  if (!spans || spans.length < MIN_DISTINCT_TEXTS * 2) return;

  const evidence = findDuplicateLayerEvidence(page, spans);
  if (!evidence) return;

  const percent = Math.round((evidence.duplicateChars / evidence.pageChars) * 100);
  out.push({
    code: 'duplicate_text_layer',
    severity: 'warning',
    message: `native text contains a hidden near-duplicate layer of the visible content (~${percent}% of page text; scale ${formatApprox(evidence.fit.scale)}, offset ${formatApprox(evidence.fit.offset)}pt) — pages[].text is inflated and layout blocks may merge duplicate runs; prefer the render or OCR when exact visible text matters`,
  });
}

function findDuplicateLayerEvidence(page: PageResult, spans: readonly TextSpan[]): DuplicateLayerEvidence | undefined {
  const pairs = buildCandidatePairs(spans);
  if (distinctTextCount(pairs) < MIN_DISTINCT_TEXTS) return undefined;

  const evidence = bestAffineEvidence(pairs);
  if (!evidence) return undefined;

  const pageChars = normalizedCharCount(page.text) || normalizedCharCount(spans.map((span) => span.text).join(' '));
  if (pageChars === 0) return undefined;
  if (evidence.duplicateChars / pageChars < MIN_PAGE_TEXT_VOLUME_RATIO) return undefined;

  return { ...evidence, pageChars };
}

function buildCandidatePairs(spans: readonly TextSpan[]): DuplicatePair[] {
  const groups = new Map<string, SpanCandidate[]>();
  for (let index = 0; index < spans.length; index++) {
    const span = spans[index];
    const text = normalizeComparableText(span.text);
    if (text.length < MIN_NORMALIZED_TEXT_LENGTH) continue;
    const existing = groups.get(text);
    const candidate = { span, index, text };
    if (existing) existing.push(candidate);
    else groups.set(text, [candidate]);
  }

  const pairs: DuplicatePair[] = [];
  for (const [text, candidates] of groups) {
    if (candidates.length < 2) continue;
    for (let i = 0; i < candidates.length - 1; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i];
        const b = candidates[j];
        const upper = a.span.y <= b.span.y ? a : b;
        const lower = upper === a ? b : a;
        if (lower.span.y - upper.span.y < MIN_VERTICAL_SEPARATION_PT) continue;
        if (!hasDifferentFontOrSize(upper.span, lower.span)) continue;
        pairs.push({ text, upper, lower, y1: upper.span.y, y2: lower.span.y });
      }
    }
  }
  return pairs;
}

function bestAffineEvidence(pairs: readonly DuplicatePair[]): Omit<DuplicateLayerEvidence, 'pageChars'> | undefined {
  let best: Omit<DuplicateLayerEvidence, 'pageChars'> | undefined;

  for (let i = 0; i < pairs.length - 1; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const first = pairs[i];
      const second = pairs[j];
      if (first.text === second.text) continue;
      const seed = fitFromTwoPairs(first, second);
      if (!fitScaleIsPlausible(seed.scale)) continue;
      const selected = selectConsistentPairs(pairs, seed);
      const fit = fitAffine(selected);
      if (!fit || !fitScaleIsPlausible(fit.scale) || fit.maxResidual > MAX_AFFINE_RESIDUAL_PT) continue;
      if (!hasEnoughDistinctTexts(selected)) continue;
      if (sourceYSpread(selected) < MIN_SOURCE_Y_SPREAD_PT) continue;
      const duplicateChars = duplicateCharVolume(selected);
      const evidence = { pairs: selected, fit, duplicateChars };
      if (isBetterEvidence(evidence, best)) best = evidence;
    }
  }

  return best;
}

function fitFromTwoPairs(first: DuplicatePair, second: DuplicatePair): AffineFit {
  const denominator = second.y1 - first.y1;
  if (Math.abs(denominator) < 0.001) return { scale: Number.POSITIVE_INFINITY, offset: 0, maxResidual: 0 };
  const scale = (second.y2 - first.y2) / denominator;
  const offset = first.y2 - scale * first.y1;
  return { scale, offset, maxResidual: 0 };
}

function selectConsistentPairs(pairs: readonly DuplicatePair[], fit: AffineFit): DuplicatePair[] {
  const byText = new Map<string, { pair: DuplicatePair; residual: number }>();
  for (const pair of pairs) {
    const residual = Math.abs(pair.y2 - (fit.scale * pair.y1 + fit.offset));
    if (residual > MAX_AFFINE_RESIDUAL_PT) continue;
    const existing = byText.get(pair.text);
    if (!existing || residual < existing.residual) byText.set(pair.text, { pair, residual });
  }
  return Array.from(byText.values(), ({ pair }) => pair);
}

function fitAffine(pairs: readonly DuplicatePair[]): AffineFit | undefined {
  if (pairs.length < MIN_DISTINCT_TEXTS) return undefined;
  const meanX = pairs.reduce((sum, pair) => sum + pair.y1, 0) / pairs.length;
  const meanY = pairs.reduce((sum, pair) => sum + pair.y2, 0) / pairs.length;
  let numerator = 0;
  let denominator = 0;
  for (const pair of pairs) {
    const dx = pair.y1 - meanX;
    numerator += dx * (pair.y2 - meanY);
    denominator += dx * dx;
  }
  if (denominator <= 0) return undefined;
  const scale = numerator / denominator;
  const offset = meanY - scale * meanX;
  const maxResidual = Math.max(...pairs.map((pair) => Math.abs(pair.y2 - (scale * pair.y1 + offset))));
  return { scale, offset, maxResidual };
}

function isBetterEvidence(
  candidate: Omit<DuplicateLayerEvidence, 'pageChars'>,
  current: Omit<DuplicateLayerEvidence, 'pageChars'> | undefined,
): boolean {
  if (!current) return true;
  if (candidate.duplicateChars !== current.duplicateChars) return candidate.duplicateChars > current.duplicateChars;
  return candidate.pairs.length > current.pairs.length;
}

function hasDifferentFontOrSize(a: TextSpan, b: TextSpan): boolean {
  const fontNameDiffers = a.fontName !== undefined && b.fontName !== undefined && a.fontName !== b.fontName;
  return fontNameDiffers || relativeFontSizeDiff(a.fontSize, b.fontSize) >= MIN_FONT_SIZE_RELATIVE_DIFF;
}

function relativeFontSizeDiff(a: number, b: number): number {
  const denominator = Math.max(Math.abs(a), Math.abs(b));
  if (denominator <= 0) return 0;
  return Math.abs(a - b) / denominator;
}

function duplicateCharVolume(pairs: readonly DuplicatePair[]): number {
  const seenLowerSpans = new Set<number>();
  let total = 0;
  for (const pair of pairs) {
    if (seenLowerSpans.has(pair.lower.index)) continue;
    seenLowerSpans.add(pair.lower.index);
    total += pair.text.length;
  }
  return total;
}

function distinctTextCount(pairs: readonly DuplicatePair[]): number {
  return new Set(pairs.map((pair) => pair.text)).size;
}

function hasEnoughDistinctTexts(pairs: readonly DuplicatePair[]): boolean {
  return distinctTextCount(pairs) >= MIN_DISTINCT_TEXTS;
}

function sourceYSpread(pairs: readonly DuplicatePair[]): number {
  const ys = pairs.map((pair) => pair.y1);
  return Math.max(...ys) - Math.min(...ys);
}

function fitScaleIsPlausible(scale: number): boolean {
  return Number.isFinite(scale) && scale >= MIN_AFFINE_SCALE && scale <= MAX_AFFINE_SCALE;
}

function normalizedCharCount(text: string): number {
  return normalizeComparableText(text).length;
}

function normalizeComparableText(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

function formatApprox(value: number): string {
  return value.toFixed(Math.abs(value) >= 10 ? 1 : 2);
}

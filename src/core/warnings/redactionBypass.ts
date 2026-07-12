import type { PageResult, PageWarning, TextSpan } from '../../types/index.js';
import type { OpaqueFillTextEvidence } from '../graphics/opaqueFillText.js';
import { normalizeComparableText } from '../graphics/opaqueFillText.js';
import { shortTextSample } from './textSamples.js';

interface RedactionBypassContext {
  opaqueFillText?: OpaqueFillTextEvidence;
  spans?: readonly TextSpan[];
  rasterBackedTextLayer?: boolean;
}

interface CoveredSpan {
  span: TextSpan;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_COVERAGE = 0.9;
const MAX_CANDIDATE_SPANS = 4_096;
const MAX_CANDIDATE_SPAN_CODE_UNITS = 65_536;
const MAX_ADJACENT_MATCH_RUNS = 4_096;
const MAX_ADJACENT_MATCH_CODE_UNITS = 65_536;
const MAX_ADJACENT_MATCH_WORK = 1_000_000;
const MAX_COVERAGE_CHECKS = 250_000;

interface AdjacentRunIndex {
  textRuns: readonly string[];
  normalizedRawRuns: readonly string[];
  normalizedTextRuns: readonly string[];
  nonWhitespacePrefix: readonly number[];
  rawCodeUnitPrefix: readonly number[];
  normalizedRawCodeUnitPrefix: readonly number[];
  normalizedTextCodeUnitPrefix: readonly number[];
  nfkcStableAcrossRunBoundaries: boolean;
}

interface MatchWorkBudget {
  remaining: number;
  exhausted: boolean;
}

export function detectTextUnderOpaqueFill(page: PageResult, context: RedactionBypassContext, out: PageWarning[]): void {
  if (context.rasterBackedTextLayer || !context.opaqueFillText) return;
  const spans = candidateSpans(context.spans ?? page.spans ?? []);
  if (!spans || spans.length === 0) return;

  const covered = new Map<TextSpan, CoveredSpan>();
  for (const item of spansCoveredByLaterFills(spans, context.opaqueFillText)) covered.set(item.span, item);
  if (covered.size === 0) return;

  const findings = [...covered.values()];
  const sample = findings[0];
  out.push({
    code: 'text_under_opaque_fill',
    severity: 'error',
    message: `${findings.length} extracted native text run${findings.length === 1 ? '' : 's'} ${findings.length === 1 ? 'is' : 'are'} at least 90% covered by a later opaque dark fill (sample: ${JSON.stringify(shortTextSample(sample.span.text))}) — the covered text remains extractable even though a human viewer cannot see it; compare with --render before trusting it`,
  });
}

function spansCoveredByLaterFills(spans: readonly TextSpan[], evidence: OpaqueFillTextEvidence): CoveredSpan[] {
  const findings: CoveredSpan[] = [];
  const matches = Array.from<{ start: number; end: number } | undefined>({ length: spans.length });
  const runIndex = createAdjacentRunIndex(evidence.textRuns);
  if (!runIndex) return findings;
  const workBudget: MatchWorkBudget = { remaining: MAX_ADJACENT_MATCH_WORK, exhausted: false };
  let runCursor = evidence.textRuns.length;

  for (let i = spans.length - 1; i >= 0; i--) {
    const span = spans[i];
    const text = normalizeComparableText(span.text);
    const match = findLastAdjacentRunMatch(runIndex, text, runCursor, workBudget);
    if (workBudget.exhausted) return [];
    if (!match) continue;
    matches[i] = match;
    runCursor = match.start;
  }
  let remainingCoverageChecks = MAX_COVERAGE_CHECKS;
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const match = matches[i];
    if (!match) continue;
    let covered = false;
    for (const fill of evidence.fills) {
      if (remainingCoverageChecks-- <= 0) return [];
      if (fill.precedingTextRunCount >= match.end && coverageRatio(span, fill) >= MIN_COVERAGE) {
        covered = true;
        break;
      }
    }
    if (covered) findings.push({ span });
  }
  return findings;
}

function findLastAdjacentRunMatch(
  index: AdjacentRunIndex,
  target: string,
  before: number,
  workBudget: MatchWorkBudget,
): { start: number; end: number } | undefined {
  // This warning is heuristic evidence, so oversized/ambiguous inputs fail closed.
  // The hard caps bound one page to 4,096 adjacent runs, 65,536 UTF-16 code
  // units, and 1,000,000 run/code-unit comparison steps.
  if (before <= 0) return undefined;
  if (
    before > index.textRuns.length ||
    before > MAX_ADJACENT_MATCH_RUNS ||
    target.length > MAX_ADJACENT_MATCH_CODE_UNITS ||
    index.rawCodeUnitPrefix[before] > MAX_ADJACENT_MATCH_CODE_UNITS ||
    index.normalizedRawCodeUnitPrefix[before] > MAX_ADJACENT_MATCH_CODE_UNITS
  ) {
    workBudget.exhausted = true;
    return undefined;
  }

  const targetLength = nonWhitespaceLength(target);
  if (targetLength === 0) return undefined;

  if (!index.nfkcStableAcrossRunBoundaries) {
    return findLastAdjacentRunMatchWithBoundaryNormalization(index, target, targetLength, before, workBudget);
  }

  for (let start = before - 1; start >= 0; start--) {
    if (!consumeMatchWork(workBudget, 1)) return undefined;
    const desiredLength = index.nonWhitespacePrefix[start] + targetLength;
    const firstEnd = lowerBound(index.nonWhitespacePrefix, desiredLength, start + 1, before + 1, workBudget);
    if (firstEnd === undefined) return undefined;
    let end = firstEnd;
    while (end <= before && index.nonWhitespacePrefix[end] === desiredLength) {
      if (!consumeMatchWork(workBudget, candidateWork(index, target, start, end))) return undefined;
      if (directRangeText(index.normalizedRawRuns, start, end) === target) return { start, end };
      if (inferredSpaceRangeText(index.normalizedTextRuns, start, end) === target) return { start, end };
      end++;
    }
  }
  return undefined;
}

function createAdjacentRunIndex(textRuns: readonly string[]): AdjacentRunIndex | undefined {
  if (textRuns.length > MAX_ADJACENT_MATCH_RUNS) return undefined;

  const rawCodeUnitPrefix = [0];
  for (const run of textRuns) {
    const total = rawCodeUnitPrefix[rawCodeUnitPrefix.length - 1] + run.length;
    if (total > MAX_ADJACENT_MATCH_CODE_UNITS) return undefined;
    rawCodeUnitPrefix.push(total);
  }

  const normalizedRawRuns = textRuns.map((run) => run.normalize('NFKC'));
  const normalizedRawCodeUnitPrefix = prefixSums(normalizedRawRuns, (run) => run.length);
  if (normalizedRawCodeUnitPrefix[normalizedRawCodeUnitPrefix.length - 1] > MAX_ADJACENT_MATCH_CODE_UNITS) {
    return undefined;
  }
  const normalizedTextRuns = normalizedRawRuns.map(collapseNormalizedComparableText);
  const joinedNormalizedRaw = normalizedRawRuns.join('');

  return {
    textRuns,
    normalizedRawRuns,
    normalizedTextRuns,
    nonWhitespacePrefix: prefixSums(normalizedRawRuns, nonWhitespaceLength),
    rawCodeUnitPrefix,
    normalizedRawCodeUnitPrefix,
    normalizedTextCodeUnitPrefix: prefixSums(normalizedTextRuns, (run) => run.length),
    nfkcStableAcrossRunBoundaries: joinedNormalizedRaw.normalize('NFKC') === joinedNormalizedRaw,
  };
}

function findLastAdjacentRunMatchWithBoundaryNormalization(
  index: AdjacentRunIndex,
  target: string,
  targetLength: number,
  before: number,
  workBudget: MatchWorkBudget,
): { start: number; end: number } | undefined {
  for (let start = before - 1; start >= 0; start--) {
    for (let end = start + 1; end <= before; end++) {
      if (!consumeMatchWork(workBudget, candidateWork(index, target, start, end))) return undefined;
      const direct = normalizeComparableText(index.textRuns.slice(start, end).join(''));
      if (direct === target) return { start, end };
      if (
        index.nonWhitespacePrefix[end] - index.nonWhitespacePrefix[start] === targetLength &&
        inferredSpaceRangeText(index.normalizedTextRuns, start, end) === target
      ) {
        return { start, end };
      }
    }
  }
  return undefined;
}

function directRangeText(runs: readonly string[], start: number, end: number): string {
  return collapseNormalizedComparableText(runs.slice(start, end).join(''));
}

function inferredSpaceRangeText(runs: readonly string[], start: number, end: number): string {
  return runs.slice(start, end).filter(Boolean).join(' ');
}

function collapseNormalizedComparableText(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

function prefixSums(runs: readonly string[], measure: (run: string) => number): number[] {
  const prefix = [0];
  for (const run of runs) prefix.push(prefix[prefix.length - 1] + measure(run));
  return prefix;
}

function candidateWork(index: AdjacentRunIndex, target: string, start: number, end: number): number {
  const runSlots = end - start;
  const rawCodeUnits = index.rawCodeUnitPrefix[end] - index.rawCodeUnitPrefix[start];
  const normalizedRawCodeUnits = index.normalizedRawCodeUnitPrefix[end] - index.normalizedRawCodeUnitPrefix[start];
  const normalizedTextCodeUnits = index.normalizedTextCodeUnitPrefix[end] - index.normalizedTextCodeUnitPrefix[start];
  return runSlots * 2 + rawCodeUnits + normalizedRawCodeUnits + normalizedTextCodeUnits + target.length * 2;
}

function consumeMatchWork(budget: MatchWorkBudget, amount: number): boolean {
  if (amount > budget.remaining) {
    budget.exhausted = true;
    return false;
  }
  budget.remaining -= amount;
  return true;
}

function lowerBound(
  values: readonly number[],
  target: number,
  low: number,
  high: number,
  workBudget: MatchWorkBudget,
): number | undefined {
  while (low < high) {
    if (!consumeMatchWork(workBudget, 1)) return undefined;
    const middle = low + Math.floor((high - low) / 2);
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function nonWhitespaceLength(text: string): number {
  return [...text.replace(/\s/gu, '')].length;
}

function candidateSpans(spans: readonly TextSpan[]): TextSpan[] | undefined {
  const candidates: TextSpan[] = [];
  let codeUnits = 0;
  for (const span of spans) {
    if (span.text.length > MAX_CANDIDATE_SPAN_CODE_UNITS) return undefined;
    if (!isCandidateSpan(span)) continue;
    codeUnits += span.text.length;
    if (candidates.length >= MAX_CANDIDATE_SPANS || codeUnits > MAX_CANDIDATE_SPAN_CODE_UNITS) return undefined;
    candidates.push(span);
  }
  return candidates;
}

function isCandidateSpan(span: TextSpan): boolean {
  return (
    [...span.text.replace(/\s/gu, '')].length >= 3 &&
    Number.isFinite(span.x) &&
    Number.isFinite(span.y) &&
    Number.isFinite(span.width) &&
    Number.isFinite(span.height) &&
    span.width > 0 &&
    span.height > 0
  );
}

function coverageRatio(target: Box, cover: Box): number {
  const area = target.width * target.height;
  if (!(area > 0)) return 0;
  const overlap = intersection(target, cover);
  return overlap ? (overlap.width * overlap.height) / area : 0;
}

function intersection(a: Box, b: Box): Box | undefined {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return undefined;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

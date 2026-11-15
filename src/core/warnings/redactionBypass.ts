import type { PageResult, PageWarning, TextSpan } from '../../types/index.js';
import type { OpaqueDarkFillEvidence, OpaqueFillTextEvidence, TextGlyphEvidence } from '../graphics/opaqueFillText.js';
import { normalizeComparableText } from '../graphics/opaqueFillText.js';
import {
  coverage,
  createComparisonBudget,
  describePassages,
  firstGlyphAtOrAfterRun,
  flattenGlyphs,
  type HiddenPassage,
  hiddenPassages,
  isOnPage,
  isRepaintedOver,
  spend,
} from './hiddenGlyphPassages.js';

interface RedactionBypassContext {
  opaqueFillText?: OpaqueFillTextEvidence;
  spans?: readonly TextSpan[];
  rasterBackedTextLayer?: boolean;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_COVERAGE = 0.9;
/** Share of a glyph's body (see `GlyphGeometry.core`) a fill must hide. */
const MIN_GLYPH_COVERAGE = 0.9;
const MAX_GLYPH_COMPARISONS = 2_000_000;
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

/**
 * Native text that a later opaque dark rectangle hides.
 *
 * Where the operator list let every glyph be placed, coverage is decided
 * per glyph, so a box over two words inside a sentence is found and named
 * — the usual shape of a failed redaction. Text whose glyphs could not be
 * placed falls back to whole-span coverage of at least 90%.
 */
export function detectTextUnderOpaqueFill(page: PageResult, context: RedactionBypassContext, out: PageWarning[]): void {
  if (context.rasterBackedTextLayer || !context.opaqueFillText) return;
  const evidence = context.opaqueFillText;
  if (evidence.fills.length === 0) return;

  const passages = glyphPassagesUnderFills(page, evidence);
  const spans = candidateSpans(context.spans ?? page.spans ?? []);
  if (spans && spans.length > 0) {
    for (const span of spansCoveredByLaterFills(spans, evidence)) {
      passages.push({ text: span.text, box: { x: span.x, y: span.y, width: span.width, height: span.height } });
    }
  }
  if (passages.length === 0) return;

  const plural = passages.length !== 1;
  out.push({
    code: 'text_under_opaque_fill',
    severity: 'error',
    message: `${passages.length} extracted native text passage${plural ? 's' : ''} ${plural ? 'are' : 'is'} covered by a later opaque dark fill: ${describePassages(passages, page.userUnit)} — the covered text remains extractable even though a human viewer sees a black box; render a listed bbox (--render-region x,y,w,h) before trusting or repeating it`,
  });
}

function glyphPassagesUnderFills(page: PageResult, evidence: OpaqueFillTextEvidence): HiddenPassage[] {
  if (!evidence.glyphRuns) return [];
  const glyphs = flattenGlyphs(evidence.glyphRuns);
  const budget = createComparisonBudget(MAX_GLYPH_COMPARISONS);
  // For each glyph, the latest fill painted after it that hides its body.
  const coveringFill = new Map<TextGlyphEvidence, OpaqueDarkFillEvidence>();
  for (const fill of evidence.fills) {
    for (const ref of glyphs) {
      if (ref.run >= fill.precedingTextRunCount) break;
      if (!spend(budget)) return [];
      if (ref.glyph.whitespace || coverage(ref.glyph.core, fill) < MIN_GLYPH_COVERAGE) continue;
      const previous = coveringFill.get(ref.glyph);
      if (!previous || previous.precedingTextRunCount < fill.precedingTextRunCount) coveringFill.set(ref.glyph, fill);
    }
  }
  if (coveringFill.size === 0) return [];

  const hidden = new Set<TextGlyphEvidence>();
  for (const [glyph, fill] of coveringFill) {
    if (!isOnPage(glyph.core, page.width, page.height)) continue;
    const later = firstGlyphAtOrAfterRun(glyphs, fill.precedingTextRunCount);
    if (isRepaintedOver(glyph, glyphs, later, budget)) continue;
    if (budget.exhausted) return [];
    hidden.add(glyph);
  }
  return hiddenPassages(glyphs, (ref) => hidden.has(ref.glyph));
}

function spansCoveredByLaterFills(spans: readonly TextSpan[], evidence: OpaqueFillTextEvidence): TextSpan[] {
  const findings: TextSpan[] = [];
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
    if (!match || runsArePlaced(evidence, match)) continue;
    let covered = false;
    for (const fill of evidence.fills) {
      if (remainingCoverageChecks-- <= 0) return [];
      if (fill.precedingTextRunCount >= match.end && coverageRatio(span, fill) >= MIN_COVERAGE) {
        covered = true;
        break;
      }
    }
    if (covered) findings.push(span);
  }
  return findings;
}

/** Glyph-level coverage already decided these runs; span coverage would only repeat or contradict it. */
function runsArePlaced(evidence: OpaqueFillTextEvidence, match: { start: number; end: number }): boolean {
  const runs = evidence.glyphRuns;
  if (!runs) return false;
  for (let i = match.start; i < match.end; i++) if (!runs[i]) return false;
  return true;
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

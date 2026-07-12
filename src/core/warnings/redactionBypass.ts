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

export function detectTextUnderOpaqueFill(page: PageResult, context: RedactionBypassContext, out: PageWarning[]): void {
  const spans = (context.spans ?? page.spans ?? []).filter(isCandidateSpan);
  if (spans.length === 0) return;

  const covered = new Map<TextSpan, CoveredSpan>();
  if (!context.rasterBackedTextLayer && context.opaqueFillText) {
    for (const item of spansCoveredByLaterFills(spans, context.opaqueFillText)) covered.set(item.span, item);
  }
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
  let runCursor = evidence.textRuns.length;

  for (let i = spans.length - 1; i >= 0; i--) {
    const span = spans[i];
    const text = normalizeComparableText(span.text);
    const match = findLastAdjacentRunMatch(evidence.textRuns, text, runCursor);
    if (!match) continue;
    matches[i] = match;
    runCursor = match.start;
  }

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const match = matches[i];
    if (!match) continue;
    const covered = evidence.fills.some(
      (fill) => fill.precedingTextRunCount >= match.end && coverageRatio(span, [fill]) >= MIN_COVERAGE,
    );
    if (covered) findings.push({ span });
  }
  return findings;
}

function findLastAdjacentRunMatch(
  textRuns: readonly string[],
  target: string,
  before: number,
): { start: number; end: number } | undefined {
  const targetLength = nonWhitespaceLength(target);
  for (let start = before - 1; start >= 0; start--) {
    let concatenated = '';
    const separated: string[] = [];
    for (let end = start; end < before; end++) {
      concatenated += textRuns[end];
      separated.push(normalizeComparableText(textRuns[end]));
      const direct = normalizeComparableText(concatenated);
      const withInferredSpaces = normalizeComparableText(separated.filter(Boolean).join(' '));
      if (direct === target || withInferredSpaces === target) return { start, end: end + 1 };
      if (nonWhitespaceLength(direct) > targetLength) break;
    }
  }
  return undefined;
}

function nonWhitespaceLength(text: string): number {
  return [...text.replace(/\s/gu, '')].length;
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

function coverageRatio(target: Box, covers: readonly Box[]): number {
  const area = target.width * target.height;
  if (!(area > 0)) return 0;
  const intersections = covers
    .map((cover) => intersection(target, cover))
    .filter((box): box is Box => box !== undefined);
  return unionArea(intersections) / area;
}

function intersection(a: Box, b: Box): Box | undefined {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return undefined;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function unionArea(boxes: readonly Box[]): number {
  if (boxes.length === 0) return 0;
  const xs = [...new Set(boxes.flatMap((box) => [box.x, box.x + box.width]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const left = xs[i];
    const right = xs[i + 1];
    if (right <= left) continue;
    const intervals = boxes
      .filter((box) => box.x < right && box.x + box.width > left)
      .map((box) => [box.y, box.y + box.height] as const)
      .sort((a, b) => a[0] - b[0]);
    const first = intervals[0];
    if (!first) continue;
    let coveredHeight = 0;
    let start = first[0];
    let end = first[1];
    for (const interval of intervals.slice(1)) {
      if (interval[0] > end) {
        coveredHeight += Math.max(0, end - start);
        start = interval[0];
        end = interval[1];
      } else {
        end = Math.max(end, interval[1]);
      }
    }
    coveredHeight += Math.max(0, end - start);
    area += (right - left) * coveredHeight;
  }
  return area;
}

import type { LayoutLine, TextSpan } from '../../types/index.js';
import { median } from './geometry.js';

/**
 * Margin line numbers: the column of consecutive integers printed beside
 * the text of pleading paper, a bill, or a manuscript in review mode, one
 * number per line of the page's line grid. They are references to the
 * lines, not content: left in the text pass they become lines of their own
 * that drift away from the text they number.
 *
 * A column qualifies only when all of this holds:
 * - at least {@link MIN_NUMBERS} bare integers (`7`, `07`, `112`), each
 *   one more than the one above it, on one edge (left, right or centre
 *   aligned) and at one pitch;
 * - the run reaches over {@link MIN_PAGE_HEIGHT_SHARE} of the page height;
 * - nothing else is printed in the column's strip, and the page's other
 *   text lies to one side of it (the column is in a margin, not a table's
 *   first column inside the text);
 * - text lines sit on the numbers' pitch: several of them share a number's
 *   baseline.
 */
export interface MarginNumber {
  value: number;
  /** Vertical centre of the printed number. */
  center: number;
}

export interface MarginNumberColumn {
  side: 'left' | 'right';
  /** Horizontal centre of the column. */
  x: number;
  pitch: number;
  numbers: MarginNumber[];
}

export interface MarginLineNumbersResult {
  columns: MarginNumberColumn[];
  remainingSpans: TextSpan[];
}

const NUMBER_RE = /^\d{1,4}$/u;
const MIN_NUMBERS = 10;
const MIN_PAGE_HEIGHT_SHARE = 0.4;
const EDGE_TOLERANCE_PT = 1.5;
const PITCH_TOLERANCE = 0.12;
/** A text line is on a number's line when their centres are this share of the pitch apart. */
const LINE_MATCH_PITCH_SHARE = 0.3;
const MIN_MATCHED_LINES = 3;
/** Share of the page's other text that must lie on the inner side of the column. */
const MIN_INNER_TEXT_SHARE = 0.95;

export function extractMarginLineNumbers(spans: TextSpan[], pageHeight: number): MarginLineNumbersResult {
  const none: MarginLineNumbersResult = { columns: [], remainingSpans: spans };
  if (pageHeight <= 0) return none;
  const candidates = spans.filter((span) => NUMBER_RE.test(span.text.trim()) && span.height <= span.fontSize * 2);
  if (candidates.length < MIN_NUMBERS) return none;
  const candidateSet = new Set(candidates);

  const taken = new Set<TextSpan>();
  const columns: MarginNumberColumn[] = [];
  const edges: ((span: TextSpan) => number)[] = [
    (span) => span.x + span.width,
    (span) => span.x,
    (span) => span.x + span.width / 2,
  ];
  for (const edge of edges) {
    for (const group of groupByEdge(
      candidates.filter((span) => !taken.has(span)),
      edge,
    )) {
      const run = longestConsecutiveRun(group);
      if (!run) continue;
      const column = acceptColumn(run, spans, candidateSet, pageHeight);
      if (!column) continue;
      for (const span of run.spans) taken.add(span);
      columns.push(column);
    }
  }
  if (columns.length === 0) return none;
  return { columns, remainingSpans: spans.filter((span) => !taken.has(span)) };
}

function groupByEdge(spans: readonly TextSpan[], edge: (span: TextSpan) => number): TextSpan[][] {
  const sorted = [...spans].sort((a, b) => edge(a) - edge(b));
  const groups: TextSpan[][] = [];
  for (const span of sorted) {
    const group = groups[groups.length - 1];
    if (group && edge(span) - edge(group[0]) <= EDGE_TOLERANCE_PT) group.push(span);
    else groups.push([span]);
  }
  return groups.filter((group) => group.length >= MIN_NUMBERS);
}

interface Run {
  spans: TextSpan[];
  values: number[];
  pitch: number;
}

/** The longest stretch, top to bottom, where each number is one more than the last at a steady pitch. */
function longestConsecutiveRun(group: readonly TextSpan[]): Run | undefined {
  const sorted = [...group].sort((a, b) => center(a) - center(b));
  let best: Run | undefined;
  let start = 0;
  const close = (end: number) => {
    const spans = sorted.slice(start, end);
    if (spans.length < MIN_NUMBERS) return;
    const steps = spans.slice(1).map((span, index) => center(span) - center(spans[index]));
    const pitch = median(steps);
    if (!(pitch > 0)) return;
    if (steps.some((step) => Math.abs(step - pitch) > pitch * PITCH_TOLERANCE)) return;
    if (!best || spans.length > best.spans.length) {
      best = { spans, values: spans.map((span) => Number(span.text.trim())), pitch };
    }
  };
  for (let index = 1; index <= sorted.length; index++) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const consecutive =
      current !== undefined &&
      Number(current.text.trim()) === Number(previous.text.trim()) + 1 &&
      center(current) - center(previous) > previous.height * 0.5;
    if (!consecutive) {
      close(index);
      start = index;
    }
  }
  return best;
}

function acceptColumn(
  run: Run,
  spans: readonly TextSpan[],
  candidates: ReadonlySet<TextSpan>,
  pageHeight: number,
): MarginNumberColumn | undefined {
  const first = run.spans[0];
  const last = run.spans[run.spans.length - 1];
  if (center(last) - center(first) < pageHeight * MIN_PAGE_HEIGHT_SHARE) return undefined;
  const own = new Set(run.spans);
  const left = Math.min(...run.spans.map((span) => span.x));
  const right = Math.max(...run.spans.map((span) => span.x + span.width));
  const top = first.y;
  const bottom = last.y + last.height;
  // The margin strip holds the numbers and nothing else, above and below
  // them too: a table's label column has its heading and its other labels
  // (`平成元` over `2`) in the same strip.
  if (spans.some((span) => !own.has(span) && span.text.trim() && span.x < right && span.x + span.width > left)) {
    return undefined;
  }
  const others = spans.filter(
    (span) => !own.has(span) && span.text.trim() && span.y + span.height > top && span.y < bottom,
  );
  const leftOf = others.filter((span) => span.x + span.width <= left).length;
  const rightOf = others.length - leftOf;
  const side = rightOf >= leftOf ? 'left' : 'right';
  if (Math.max(leftOf, rightOf) < others.length * MIN_INNER_TEXT_SHARE) return undefined;
  const inner = others.filter((span) => (side === 'left' ? span.x >= right : span.x + span.width <= left));
  let matched = 0;
  let worded = 0;
  for (const number of run.spans) {
    const onLine = inner.filter(
      (span) => !candidates.has(span) && Math.abs(center(span) - center(number)) <= run.pitch * LINE_MATCH_PITCH_SHARE,
    );
    if (onLine.length === 0) continue;
    matched++;
    if (onLine.some((span) => /\p{L}/u.test(span.text))) worded++;
  }
  if (matched < MIN_MATCHED_LINES) return undefined;
  // The numbered lines are text; a row-number column beside figures is a table's.
  if (worded * 2 < matched) return undefined;
  return {
    side,
    x: (left + right) / 2,
    pitch: run.pitch,
    numbers: run.spans.map((span, index) => ({ value: run.values[index], center: center(span) })),
  };
}

function center(box: { y: number; height: number }): number {
  return box.y + box.height / 2;
}

/**
 * Give each line the number printed on its baseline, from the column on
 * its own side of the page. A line between two numbers (single-spaced
 * text on a double-spaced grid) gets none.
 */
export function numberLines(lines: readonly LayoutLine[], columns: readonly MarginNumberColumn[]): void {
  if (columns.length === 0) return;
  for (const line of lines) {
    if (line.writingMode === 'vertical' || !line.text.trim()) continue;
    const column = nearestColumn(line, columns);
    const middle = line.y + line.height / 2;
    let best: MarginNumber | undefined;
    for (const number of column.numbers) {
      const distance = Math.abs(number.center - middle);
      if (distance > column.pitch * LINE_MATCH_PITCH_SHARE) continue;
      if (!best || distance < Math.abs(best.center - middle)) best = number;
    }
    if (best) line.lineNumber = best.value;
  }
}

function nearestColumn(line: LayoutLine, columns: readonly MarginNumberColumn[]): MarginNumberColumn {
  let best = columns[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const column of columns) {
    const distance = column.side === 'left' ? line.x - column.x : column.x - (line.x + line.width);
    const value = distance >= 0 ? distance : Number.POSITIVE_INFINITY;
    if (value < bestDistance) {
      best = column;
      bestDistance = value;
    }
  }
  return best;
}

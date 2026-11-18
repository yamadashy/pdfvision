import type { TextSpan } from '../../../types/index.js';
import { type BBox, round2 } from '../geometry.js';

/** Two runs within this many ems of one baseline sit on it together. */
export const SAME_BASELINE_EM = 0.2;

const BIG_OPERATOR_RE = /^[∑∏∐⋃⋂⋁⋀⨁⨂⨀⨄⨆∫∬∭∮∯∰⨌]$/u;
const RADICAL_RE = /^[√∛∜]$/u;
const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** Pieces of the page taken out, and the one span that reads them in their place. */
export interface Assembled {
  parts: TextSpan[];
  span: TextSpan;
}

export function isBigOperator(span: TextSpan): boolean {
  return BIG_OPERATOR_RE.test(span.text.trim());
}

export function isRadical(span: TextSpan): boolean {
  return RADICAL_RE.test(span.text.trim());
}

export function hasCjk(text: string): boolean {
  return CJK_RE.test(text);
}

export function em(span: TextSpan): number {
  return span.fontSize || span.height || 10;
}

/** Span boxes run from the baseline up by the font size. */
export function baseline(span: TextSpan): number {
  return span.y + span.height;
}

export function right(box: BBox): number {
  return box.x + box.width;
}

export function boxOf(items: readonly BBox[]): BBox {
  const x = Math.min(...items.map((item) => item.x));
  const y = Math.min(...items.map((item) => item.y));
  const r = Math.max(...items.map(right));
  const b = Math.max(...items.map((item) => item.y + item.height));
  return { x: round2(x), y: round2(y), width: round2(r - x), height: round2(b - y) };
}

/** One span for a linearised term, on the line of `line` and across `left`..`end`. */
export function termOnLine(text: string, left: number, end: number, line: TextSpan): TextSpan {
  return {
    text,
    x: round2(left),
    y: line.y,
    width: round2(end - left),
    height: line.height,
    fontSize: line.fontSize,
    ...(line.fontName !== undefined && { fontName: line.fontName }),
  };
}

/** `pool` with `parts` taken out and `span` put where the first of them was. */
export function replaceParts(pool: readonly TextSpan[], parts: readonly TextSpan[], span: TextSpan): TextSpan[] {
  const removed = new Set(parts);
  const out: TextSpan[] = [];
  let placed = false;
  for (const item of pool) {
    if (!removed.has(item)) out.push(item);
    else if (!placed) {
      out.push(span);
      placed = true;
    }
  }
  if (!placed) out.push(span);
  return out;
}

/** The text beside `box` on the horizontal line `axis`, nearest first within `maxGapEm`. */
export function axisNeighbour(
  pool: readonly TextSpan[],
  box: BBox,
  axis: number,
  exclude: ReadonlySet<TextSpan>,
  maxGapEm: number,
): TextSpan | undefined {
  const overlapEm = 0.3;
  let best: { span: TextSpan; gap: number } | undefined;
  for (const span of pool) {
    if (exclude.has(span) || isBigOperator(span)) continue;
    const size = em(span);
    if (axis < span.y - overlapEm * size || axis > baseline(span) + overlapEm * size) continue;
    const gap = span.x >= box.x ? span.x - right(box) : box.x - right(span);
    if (gap < -overlapEm * size || gap > maxGapEm * size) continue;
    // A span the box runs through is its own line of text (a strike-through), not a neighbour.
    if (Math.min(right(span), right(box)) - Math.max(span.x, box.x) > size) continue;
    if (!best || gap < best.gap) best = { span, gap };
  }
  return best?.span;
}

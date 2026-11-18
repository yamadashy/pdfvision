import type { TextSpan } from '../../../types/index.js';
import { renderScript } from '../../text/scripts.js';
import { joinLineSpans } from '../lineText.js';
import {
  type Assembled,
  baseline,
  boxOf,
  em,
  isBigOperator,
  isRadical,
  right,
  SAME_BASELINE_EM,
  termOnLine,
} from './shared.js';

/** The operator's own box is unreliable (math fonts draw it hanging from the baseline), so its line is looked for in a band this tall. */
const BAND_ABOVE = 0.3;
const BAND_BELOW = 2.2;
/** Text this close beside the operator is its line's; further out (a limit and a radical between) only when nothing is that close. */
const NEIGHBOUR_NEAR_GAP_EM = 1.6;
const NEIGHBOUR_MAX_GAP_EM = 2.5;
/** The line beside an operator is set at body size; a smaller run there is a limit. */
const NEIGHBOUR_MIN_BODY_RATIO = 0.86;
const NEIGHBOUR_MIN_SIZE_RATIO = 0.35;
/** A piece of a tall bracket or bar built from glyphs; it hangs beside a formula's line, not on it. */
const DELIMITER_PIECE_RE = /^[∣|‖⎪⎜⎟⎢⎥⎡⎣⎤⎦⎛⎝⎞⎠⎧⎨⎩⎫⎬⎭]$/u;
/** A limit or script of an operator is set smaller than its line. */
const LIMIT_MAX_SIZE_RATIO = 0.86;
const LIMIT_MIN_DROP_EM = 0.1;
const LIMIT_MIN_RAISE_EM = 0.25;
const LIMIT_MAX_SHIFT_EM = 2.2;
/** Limits set at the operator's right, as an integral's are. */
const LIMIT_SIDE_OVERLAP_EM = 0.9;
const LIMIT_SIDE_GAP_EM = 0.45;
const LIMIT_UNDER_SLACK_EM = 0.5;
const LIMIT_PIECE_GAP_EM = 0.5;
/** An operator this much larger than its line, or this far off its baseline, was set apart from it. */
const DISPLAY_SIZE_RATIO = 1.3;
const OFF_BASELINE_EM = 0.25;

/**
 * A big operator (`∑ ∏ ∫ …`) put back on the line it stands in, with its
 * limits: `∑_{k=1}^N`. Its line is the largest text beside it; its limits
 * are smaller runs above and below it, under its width or at its right.
 */
export function operatorAt(op: TextSpan, pool: readonly TextSpan[], bodySize: number): Assembled | undefined {
  const line = operatorLine(op, pool, bodySize);
  if (!line) return undefined;
  const size = em(line);
  const lineBaseline = baseline(line);
  const displaced =
    em(op) >= size * DISPLAY_SIZE_RATIO || Math.abs(baseline(op) - lineBaseline) > OFF_BASELINE_EM * size;
  // A radical has no limits; drawn hanging like a big operator, it only needs putting back on its line.
  if (isRadical(op))
    return displaced ? { parts: [op], span: termOnLine(op.text.trim(), op.x, right(op), line) } : undefined;

  const limits = pool.filter((span) => {
    if (span === op || span === line || isBigOperator(span)) return false;
    if (em(span) > size * LIMIT_MAX_SIZE_RATIO) return false;
    const shift = baseline(span) - lineBaseline;
    if (Math.abs(shift) > LIMIT_MAX_SHIFT_EM * size) return false;
    if (shift < 0 ? -shift < LIMIT_MIN_RAISE_EM * size : shift < LIMIT_MIN_DROP_EM * size) return false;
    const centre = span.x + span.width / 2;
    const under = centre >= op.x - LIMIT_UNDER_SLACK_EM * size && centre <= right(op) + LIMIT_UNDER_SLACK_EM * size;
    const side = span.x >= right(op) - LIMIT_SIDE_OVERLAP_EM * size && span.x <= right(op) + LIMIT_SIDE_GAP_EM * size;
    return under || side;
  });
  const upper = limitRun(
    limits.filter((span) => baseline(span) < lineBaseline),
    pool,
    size,
    'upper',
  );
  const lower = limitRun(
    limits.filter((span) => baseline(span) > lineBaseline),
    pool,
    size,
    'lower',
  );
  if (!upper && !lower && !displaced) return undefined;

  const parts = [op, ...(lower ?? []), ...(upper ?? [])];
  const box = boxOf(parts);
  const text = `${op.text.trim()}${lower ? renderScript('sub', joinLineSpans(lower)) : ''}${upper ? renderScript('sup', joinLineSpans(upper)) : ''}`;
  return { parts, span: termOnLine(text, box.x, right(box), line) };
}

function operatorLine(op: TextSpan, pool: readonly TextSpan[], bodySize: number): TextSpan | undefined {
  const opSize = em(op);
  const bandTop = op.y - BAND_ABOVE * op.height;
  const bandBottom = op.y + BAND_BELOW * op.height;
  // Of the text right beside it, the line whose middle is nearest the
  // operator's: a sum set inside a numerator belongs to the numerator, not
  // to the equation's line just below it. Text further out (past a limit
  // and a radical) counts only when nothing is that close.
  const opCentre = op.y + op.height / 2;
  type Candidate = { span: TextSpan; distance: number; gap: number };
  let best: Candidate | undefined;
  let far: Candidate | undefined;
  for (const span of pool) {
    if (span === op || isBigOperator(span) || isRadical(span) || DELIMITER_PIECE_RE.test(span.text.trim())) continue;
    const size = em(span);
    if (size < opSize * NEIGHBOUR_MIN_SIZE_RATIO || size < bodySize * NEIGHBOUR_MIN_BODY_RATIO) continue;
    const centre = span.y + span.height / 2;
    if (centre < bandTop || centre > bandBottom) continue;
    const gap = span.x >= right(op) ? span.x - right(op) : op.x - right(span);
    if (gap < -0.3 * size || gap > NEIGHBOUR_MAX_GAP_EM * size) continue;
    const candidate = { span, distance: Math.abs(centre - opCentre), gap };
    if (gap <= NEIGHBOUR_NEAR_GAP_EM * size) best = better(best, candidate);
    else far = better(far, candidate);
  }
  return (best ?? far)?.span;
}

/** The larger text, then the line whose middle is nearer the operator's, then the nearer one. */
function better<T extends { span: TextSpan; distance: number; gap: number }>(best: T | undefined, next: T): T {
  if (!best) return next;
  const size = em(next.span);
  const bestSize = em(best.span);
  if (size > bestSize * 1.05) return next;
  if (size < bestSize * 0.95) return best;
  if (next.distance < best.distance - 0.5) return next;
  return Math.abs(next.distance - best.distance) <= 0.5 && next.gap < best.gap ? next : best;
}

/** The limit pieces nearest the line on one side, chained when they share a baseline (`k` `=1`). */
function limitRun(
  candidates: readonly TextSpan[],
  pool: readonly TextSpan[],
  size: number,
  side: 'upper' | 'lower',
): TextSpan[] | undefined {
  if (candidates.length === 0) return undefined;
  const nearest = side === 'upper' ? Math.max(...candidates.map(baseline)) : Math.min(...candidates.map(baseline));
  const run = new Set(candidates.filter((span) => Math.abs(baseline(span) - nearest) <= SAME_BASELINE_EM * size));
  // Pieces of a tall bracket beside the operator hang across every baseline; they are not a line.
  const sameBaseline = pool.filter(
    (span) =>
      Math.abs(baseline(span) - nearest) <= SAME_BASELINE_EM * size && !DELIMITER_PIECE_RE.test(span.text.trim()),
  );
  let grew = true;
  while (grew) {
    grew = false;
    for (const span of sameBaseline) {
      if (run.has(span)) continue;
      const touches = [...run].some(
        (piece) =>
          span.x - right(piece) <= LIMIT_PIECE_GAP_EM * size && piece.x - right(span) <= LIMIT_PIECE_GAP_EM * size,
      );
      if (!touches) continue;
      // A full-size run touching it: the limit is a word of the line above or below.
      if (em(span) > size * LIMIT_MAX_SIZE_RATIO || isBigOperator(span)) return undefined;
      run.add(span);
      grew = true;
    }
  }
  return [...run].sort((a, b) => a.x - b.x);
}

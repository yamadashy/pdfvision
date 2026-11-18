import type { TextSpan, VectorBox } from '../../../types/index.js';
import type { BBox } from '../geometry.js';
import { joinLineSpans } from '../lineText.js';
import {
  type Assembled,
  axisNeighbour,
  baseline,
  boxOf,
  em,
  hasCjk,
  isBigOperator,
  isRadical,
  right,
  SAME_BASELINE_EM,
  termOnLine,
} from './shared.js';

/** A rule this thin is a fraction bar or a line, not a box. */
const BAR_MAX_THICKNESS_PT = 1.6;
const BAR_MIN_WIDTH_PT = 2;
const BAR_MAX_PAGE_WIDTH_SHARE = 0.6;
/** Bars on a page with more rules than this are a drawing or a form grid. */
const MAX_BARS = 400;
/** Numerator baseline above the bar, in ems of the numerator. */
const NUM_MIN_RISE_EM = 0.05;
const NUM_MAX_RISE_EM = 1.3;
/** Denominator baseline below the bar; the line through the bar sits nearer. */
const DEN_MIN_DROP_EM = 0.45;
const DEN_MAX_DROP_EM = 1.8;
/** How far a numerator or denominator may overhang the bar's ends. */
const PART_OVERHANG_EM = 0.5;
/** A gap this wide inside a part is a column gap, not math spacing. */
const PART_MAX_GAP_EM = 1;
/** Text on the part's baseline this close to it continues it. */
const PART_CONTINUATION_GAP_EM = 0.6;
const PART_MAX_CENTRE_OFFSET_EM = 0.4;
const PART_MAX_CENTRE_OFFSET_SHARE = 0.15;
/** The bar is barely wider than its wider part. */
const BAR_MAX_EXTRA_EM = 1.5;
const AXIS_NEIGHBOUR_MAX_GAP_EM = 1.2;
const PART_MAX_SIZE_RATIO = 1.25;
/** The math axis, where a fraction bar sits, is a quarter em above the baseline of the text beside it. */
const AXIS_ABOVE_BASELINE_EM = 0.25;
const AXIS_TOLERANCE_EM = 0.35;
/** A rule whose end meets another rule's is a segment of a table's grid. */
const GRID_TOUCH_PT = 1.5;
const GRID_SAME_LINE_PT = 0.8;
/** Radical signs stand just left of the part they cover. */
const RADICAL_MAX_GAP_EM = 0.3;

/** Characters math puts inside a fraction. */
const MATH_PART_SIGNAL_RE = /[=<>≤≥≈≡∼≃≅∝≠+\-−±∓×·∗∘/^_()[\]∑∏∫√∂∇∞→⇒↦]/u;
/** Signs math sets beside a fraction; brackets and hyphens are common in prose too. */
const MATH_NEIGHBOUR_SIGNAL_RE = /[=<>≤≥≈≡∼≃≅∝≠+−±∓×·∗∘^_∑∏∫√∂∇∞→⇒↦]/u;
/**
 * A part that reads as one term needs no brackets: a number (`2`, `0.5`) or
 * a symbol with its scripts and argument (`H_0`, `E(z′)`, `√t`). A number
 * before a letter is a product (`2τ`), bracketed so `1/(2τ)` cannot read
 * as `(1/2)τ`.
 */
const ATOMIC_PART_RE = /^[√∛∜]?(?:\p{N}+(?:\.\p{N}+)?|\p{L}[\p{L}\p{N}′″'_^{}\p{M}]*)(?:\([^()\s]*\))?$/u;

/** Thin horizontal rules, narrowest first: a nested fraction is one term of the outer one. */
export function fractionBars(boxes: readonly VectorBox[] | undefined, pageWidth: number): BBox[] {
  if (!boxes || boxes.length === 0) return [];
  const maxWidth = pageWidth > 0 ? pageWidth * BAR_MAX_PAGE_WIDTH_SHARE : Number.POSITIVE_INFINITY;
  const bars = boxes.filter(
    (box) =>
      [box.x, box.y, box.width, box.height].every(Number.isFinite) &&
      box.height <= BAR_MAX_THICKNESS_PT &&
      box.width >= BAR_MIN_WIDTH_PT &&
      box.width <= maxWidth &&
      box.width > box.height * 2,
  );
  if (bars.length > MAX_BARS) return [];
  const verticals = boxes.filter(
    (box) => box.width <= BAR_MAX_THICKNESS_PT && box.height > box.width * 2 && Number.isFinite(box.x + box.y),
  );
  return bars.filter((bar) => !isGridSegment(bar, bars, verticals)).sort((a, b) => a.width - b.width);
}

/**
 * A rule continued by another rule on its line, or ended by a vertical
 * rule: a cell border of a ruled table, drawn segment by segment. A
 * fraction bar stands alone.
 */
function isGridSegment(bar: BBox, bars: readonly BBox[], verticals: readonly BBox[]): boolean {
  const axis = bar.y + bar.height / 2;
  const touchesEnd = (x: number) => Math.abs(x - bar.x) <= GRID_TOUCH_PT || Math.abs(x - right(bar)) <= GRID_TOUCH_PT;
  for (const other of bars) {
    if (other === bar || Math.abs(other.y + other.height / 2 - axis) > GRID_SAME_LINE_PT) continue;
    if (touchesEnd(other.x) || touchesEnd(right(other))) return true;
  }
  for (const rule of verticals) {
    if (rule.y > axis + GRID_TOUCH_PT || rule.y + rule.height < axis - GRID_TOUCH_PT) continue;
    if (touchesEnd(rule.x + rule.width / 2)) return true;
  }
  return false;
}

export interface FractionReading {
  /** The fraction read as one term. */
  assembled?: Assembled;
  /** A fraction by every sign, with pieces inside it that could not be placed (an unattached script, a nested root). */
  unread?: { region: BBox; parts: TextSpan[] };
}

/**
 * The fraction drawn around `bar`: one tight run centred above it, one
 * centred below it, both inside its ends, and text beside it on the line
 * the bar runs along (`=`, `−`, an operator). Read as `num/den`, a part
 * longer than one term in brackets.
 */
export function fractionAt(bar: BBox, pool: readonly TextSpan[]): FractionReading | undefined {
  const axis = bar.y + bar.height / 2;
  const overlapsBar = (span: TextSpan) => span.x < right(bar) && right(span) > bar.x;
  let numBaseline = Number.NEGATIVE_INFINITY;
  let denBaseline = Number.POSITIVE_INFINITY;
  for (const span of pool) {
    if (!overlapsBar(span)) continue;
    const at = baseline(span);
    const size = em(span);
    const rise = axis - at;
    if (rise >= NUM_MIN_RISE_EM * size && rise <= NUM_MAX_RISE_EM * size) numBaseline = Math.max(numBaseline, at);
    const drop = at - axis;
    if (drop >= DEN_MIN_DROP_EM * size && drop <= DEN_MAX_DROP_EM * size) denBaseline = Math.min(denBaseline, at);
  }
  if (!Number.isFinite(numBaseline) || !Number.isFinite(denBaseline)) return undefined;
  const num = partRow(pool, numBaseline, bar);
  const den = partRow(pool, denBaseline, bar);
  if (!num || !den) return undefined;
  withRadical(num, pool);
  withRadical(den, pool);
  const parts = [...num, ...den];

  const neighbour = axisNeighbour(pool, bar, axis, new Set(parts), AXIS_NEIGHBOUR_MAX_GAP_EM);
  if (!neighbour) return undefined;
  const size = em(neighbour);
  if (Math.abs(baseline(neighbour) - AXIS_ABOVE_BASELINE_EM * size - axis) > AXIS_TOLERANCE_EM * size) return undefined;

  const numBox = boxOf(num);
  const denBox = boxOf(den);
  if (bar.width > Math.max(numBox.width, denBox.width) + BAR_MAX_EXTRA_EM * size) return undefined;
  const centre = bar.x + bar.width / 2;
  const maxOffset = Math.max(PART_MAX_CENTRE_OFFSET_EM * size, bar.width * PART_MAX_CENTRE_OFFSET_SHARE);
  if ([numBox, denBox].some((box) => Math.abs(box.x + box.width / 2 - centre) > maxOffset)) return undefined;

  const numText = joinLineSpans(num);
  const denText = joinLineSpans(den);
  if (hasCjk(numText) || hasCjk(denText)) return undefined;
  const mathy =
    MATH_PART_SIGNAL_RE.test(numText) ||
    MATH_PART_SIGNAL_RE.test(denText) ||
    MATH_NEIGHBOUR_SIGNAL_RE.test(neighbour.text);
  if (!mathy) return undefined;

  // Anything else between the numerator's top and the denominator's foot,
  // over the bar, or a part larger than the line, is a piece not read.
  const top = Math.min(...num.map((span) => span.y));
  const foot = Math.max(...den.map(baseline));
  const taken = new Set(parts);
  const stray = pool.filter(
    (span) =>
      !taken.has(span) &&
      span !== neighbour &&
      span.x >= bar.x - 0.5 &&
      right(span) <= right(bar) + 0.5 &&
      span.y + span.height / 2 > top &&
      span.y + span.height / 2 < foot,
  );
  if (stray.length > 0 || parts.some((span) => em(span) > size * PART_MAX_SIZE_RATIO)) {
    return { unread: { region: boxOf([bar, ...parts, ...stray]), parts: [...parts, ...stray] } };
  }

  const left = Math.min(bar.x, numBox.x, denBox.x);
  const end = Math.max(right(bar), right(numBox), right(denBox));
  return {
    assembled: { parts, span: termOnLine(`${bracketed(numText)}/${bracketed(denText)}`, left, end, neighbour) },
  };
}

/**
 * The spans on one baseline over (or under) the bar, if they make one tight
 * run inside it. Text nearby on the same baseline is something else (an
 * operator's limits beside the fraction) unless it touches the run: then
 * the run carries on past the bar, a line of text over a rule.
 */
function partRow(pool: readonly TextSpan[], at: number, bar: BBox): TextSpan[] | undefined {
  const x0 = bar.x;
  const x1 = right(bar);
  const onBaseline = pool.filter((span) => Math.abs(baseline(span) - at) <= SAME_BASELINE_EM * em(span));
  const core = onBaseline.filter((span) => {
    const overlap = Math.min(right(span), x1) - Math.max(span.x, x0);
    return overlap > Math.min(span.width, bar.width) * 0.5;
  });
  if (core.length === 0) return undefined;
  const sorted = [...core].sort((a, b) => a.x - b.x);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].x - right(sorted[i - 1]) > PART_MAX_GAP_EM * em(sorted[i])) return undefined;
  }
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first.x < x0 - PART_OVERHANG_EM * em(first) || right(last) > x1 + PART_OVERHANG_EM * em(last)) return undefined;
  const inCore = new Set(core);
  const continued = onBaseline.some((span) => {
    if (inCore.has(span) || isBigOperator(span)) return false;
    const leftGap = first.x - right(span);
    const rightGap = span.x - right(last);
    return leftGap >= 0
      ? leftGap < PART_CONTINUATION_GAP_EM * em(first)
      : rightGap >= 0 && rightGap < PART_CONTINUATION_GAP_EM * em(last);
  });
  return continued ? undefined : sorted;
}

/** A radical sign just left of a part covers it (`√t`): it joins the part, wherever its glyph box sits. */
function withRadical(part: TextSpan[], pool: readonly TextSpan[]): void {
  const first = part[0];
  const top = Math.min(...part.map((span) => span.y));
  const foot = Math.max(...part.map(baseline));
  const radical = pool.find(
    (span) =>
      isRadical(span) &&
      !part.includes(span) &&
      right(span) <= first.x + RADICAL_MAX_GAP_EM * em(first) &&
      first.x - right(span) <= RADICAL_MAX_GAP_EM * em(first) &&
      span.y < foot &&
      baseline(span) > top,
  );
  if (radical) part.unshift(radical);
}

function bracketed(text: string): string {
  const trimmed = text.trim();
  return ATOMIC_PART_RE.test(trimmed) ? trimmed : `(${trimmed})`;
}

import type { TextSpan } from '../../types/index.js';

const spansWithExplicitSpaceBefore = new WeakSet<TextSpan>();

/** Record that pdf.js emitted an explicit whitespace item immediately
 * before this span in visual order. Kept outside TextSpan so geometry and
 * layout serializers cannot expose internal reconstruction metadata. */
export function markExplicitSpaceBefore(span: TextSpan): void {
  spansWithExplicitSpaceBefore.add(span);
}

export function hasExplicitSpaceBefore(span: TextSpan): boolean {
  return spansWithExplicitSpaceBefore.has(span);
}

const mathTerms = new WeakSet<TextSpan>();

/** Record that this span is a linearised piece of two-dimensional math
 * (`(a + b)/c`, `∑_{k=1}^N`). Its pieces sat at different heights, so
 * the gaps around it say nothing about word spaces; it is set apart from
 * its neighbours by a space. */
export function markMathTerm(span: TextSpan): void {
  mathTerms.add(span);
}

export function isMathTerm(span: TextSpan): boolean {
  return mathTerms.has(span);
}

export type QuarterTurn = 90 | 180 | 270;

const turnedSpans = new WeakMap<TextSpan, QuarterTurn>();

/** Record that this span's baseline is turned a quarter (or half) turn on
 * the page: the clockwise turn of the page, as `/Rotate` counts it, that
 * would show it upright. 90 is text running up the page. */
export function markSpanTurn(span: TextSpan, turn: QuarterTurn): void {
  turnedSpans.set(span, turn);
}

export function spanTurn(span: TextSpan): QuarterTurn | undefined {
  return turnedSpans.get(span);
}

/** Preserve internal reconstruction metadata when a layout pass has to
 * clone a span, such as when horizontal ruby text is attached. */
export function copySpanMetadata(source: TextSpan, target: TextSpan): TextSpan {
  if (hasExplicitSpaceBefore(source)) markExplicitSpaceBefore(target);
  if (isMathTerm(source)) markMathTerm(target);
  const turn = spanTurn(source);
  if (turn !== undefined) markSpanTurn(target, turn);
  return target;
}

import type { TextSpan } from '../../../types/index.js';
import { joinLineSpans } from '../lineText.js';
import { isMathTerm, markMathTerm } from '../spanMetadata.js';
import { baseline, em, right } from './shared.js';

const EQUATION_NUMBER_RE = /^\((?:\d{1,3}(?:\.\d{1,3}){0,2}[a-z]?|[A-Z]\.?\d{1,3}[a-z]?)\)$/u;
const SAME_LINE_EM = 0.3;
/** Nothing after the number on its line this close: it ends the line (or its column). */
const TRAILING_CLEAR_EM = 1.2;
/** Runs of one equation sit this close; a wider gap ends it. */
const EQUATION_GAP_EM = 1.5;
const RELATION_RE = /[=≈≤≥≡≠∝∼≃≅<>]/u;
const SCRIPT_RE = /[\^_]/u;

export function hasEquationNumber(spans: readonly TextSpan[]): boolean {
  return spans.some((span) => EQUATION_NUMBER_RE.test(span.text.trim()));
}

/**
 * Join an equation's number to the equation: `… dz′/E(z′), (1)`. A display
 * equation is centred and its number set at the right margin, a column gap
 * away, so line building would read the number as a block of its own, and
 * the ordering pass can put it after the next equation or among the page
 * numbers. The line must be math: it holds a linearised term, or a
 * relation sign with a script (`E(z)^2 = …`). A bare `(1)` closing an
 * ordinary line stays where it is. Returns `pool` itself when no number
 * was attached.
 */
export function attachEquationNumbers(pool: readonly TextSpan[]): readonly TextSpan[] {
  const numbers = pool.filter((span) => EQUATION_NUMBER_RE.test(span.text.trim()));
  if (numbers.length === 0) return pool;
  const merged = new Map<TextSpan, TextSpan>();
  const dropped = new Set<TextSpan>();
  for (const number of numbers) {
    const size = em(number);
    const onLine = (span: TextSpan) =>
      span !== number && !dropped.has(span) && Math.abs(baseline(span) - baseline(number)) <= SAME_LINE_EM * size;
    const trailing = pool.some(
      (span) => onLine(span) && span.x >= right(number) && span.x - right(number) < TRAILING_CLEAR_EM * size,
    );
    if (trailing) continue;
    const equation = equationBefore(pool.filter(onLine), number);
    if (equation.length === 0) continue;
    const text = joinLineSpans(equation);
    if (!equation.some(isMathTerm) && !(RELATION_RE.test(text) && SCRIPT_RE.test(text))) continue;
    const last = equation[equation.length - 1];
    const current = merged.get(last) ?? last;
    const joined: TextSpan = {
      ...current,
      text: `${current.text} ${number.text.trim()}`,
      width: right(number) - current.x,
    };
    if (isMathTerm(current)) markMathTerm(joined);
    merged.set(last, joined);
    dropped.add(number);
  }
  if (dropped.size === 0) return pool;
  return pool.filter((span) => !dropped.has(span)).map((span) => merged.get(span) ?? span);
}

/** The runs left of `number` on its line, back from the nearest one while they stay close. */
function equationBefore(line: readonly TextSpan[], number: TextSpan): TextSpan[] {
  const before = line.filter((span) => right(span) <= number.x).sort((a, b) => right(b) - right(a));
  if (before.length === 0) return [];
  const equation = [before[0]];
  let left = before[0].x;
  for (const span of before.slice(1)) {
    if (left - right(span) > EQUATION_GAP_EM * em(span)) break;
    equation.push(span);
    left = Math.min(left, span.x);
  }
  return equation.sort((a, b) => a.x - b.x);
}

import type { TextSpan, VectorBox } from '../../../types/index.js';
import type { BBox } from '../geometry.js';
import { markMathTerm } from '../spanMetadata.js';
import { hasVerticalTextShape } from '../verticalText.js';
import { attachEquationNumbers, hasEquationNumber } from './equationNumbers.js';
import { fractionAt, fractionBars } from './fractions.js';
import { bracketBoxes, matrixBrackets } from './matrices.js';
import { operatorAt } from './operators.js';
import { type Assembled, boxOf, isBigOperator, isRadical, replaceParts } from './shared.js';

export interface DisplayMathResult {
  spans: TextSpan[];
  /** Regions of the terms that were linearised. */
  equations: BBox[];
  /** Two-dimensional math that could not be put on one line soundly. */
  unresolved: BBox[];
}

/**
 * Linearise two-dimensional math into one line of text: a fraction becomes
 * `(c (1 + z))/H_0`, a big operator with limits `∑_{k=1}^N`, a bracketed
 * matrix `[[a, b], [c, d]]`, and the equation's number joins its line.
 *
 * A typesetter draws a display equation as runs on several baselines — a
 * numerator above a vector bar and a denominator below it, a sum sign set
 * large with its limits as small runs above and below — and nothing in the
 * content stream joins them. Read as lines, the numerator joins whatever
 * sits on its baseline (an integral's upper limit), the denominator lands
 * in the next equation, and the reading is wrong in a way that looks like
 * text. Geometry is the evidence (see `fractions.ts`, `operators.ts`,
 * `matrices.ts`); each test is shaped so that a rule under a heading, a
 * table border, a signature line or a label over a field fails it.
 *
 * The pieces are replaced by one span on the equation's line, so line
 * building reads the equation as one line of text. Inner fractions are
 * read first, so a nested fraction is one term of the outer one.
 */
export function assembleDisplayMath(
  spans: readonly TextSpan[],
  vectorBoxes: readonly VectorBox[] | undefined,
  pageWidth = 0,
): DisplayMathResult {
  const unchanged: DisplayMathResult = { spans: [...spans], equations: [], unresolved: [] };
  const isSeated = (span: TextSpan) => isBigOperator(span) || isRadical(span);
  const hasOperator = spans.some(isSeated);
  const bars = fractionBars(vectorBoxes, pageWidth);
  const brackets = bracketBoxes(vectorBoxes);
  const numbered = hasEquationNumber(spans);
  if (bars.length === 0 && brackets.length < 2 && !hasOperator && !numbered) return unchanged;

  const vertical = new Set(spans.filter((span) => hasVerticalTextShape(span) && !isBigOperator(span)));
  let pool: readonly TextSpan[] = spans.filter((span) => !vertical.has(span));
  const equations: BBox[] = [];
  const unresolved: BBox[] = [];
  const terms: TextSpan[] = [];
  const apply = (assembled: Assembled, region: BBox) => {
    pool = replaceParts(pool, assembled.parts, assembled.span);
    markMathTerm(assembled.span);
    terms.push(assembled.span);
    equations.push(region);
  };

  const unread: { region: BBox; parts: readonly TextSpan[] }[] = [];
  for (const bar of bars) {
    const fraction = fractionAt(bar, pool);
    if (fraction?.assembled) apply(fraction.assembled, boxOf([...fraction.assembled.parts, bar]));
    else if (fraction?.unread) unread.push(fraction.unread);
  }
  const rules = (vectorBoxes ?? []).filter((box) => box.height <= 1.6 && box.width > box.height * 2);
  for (const matrix of matrixBrackets(brackets, pool, rules)) {
    if (matrix.assembled) apply(matrix.assembled, matrix.region);
    else unread.push({ region: matrix.region, parts: [] });
  }
  if (hasOperator) {
    for (const op of pool.filter(isSeated)) {
      if (!pool.includes(op)) continue;
      const assembled = operatorAt(op, pool);
      if (assembled) apply(assembled, boxOf(assembled.parts));
    }
  }

  // A piece left unread inside an outer term that was read after all is not unread.
  const remaining = new Set(pool);
  for (const item of unread) {
    if (item.parts.length === 0 || item.parts.some((span) => remaining.has(span))) unresolved.push(item.region);
  }
  const numberedPool = numbered ? attachEquationNumbers(pool) : pool;
  if (terms.length === 0 && numberedPool === pool) return { ...unchanged, unresolved };
  pool = numberedPool;
  return { spans: [...pool, ...spans.filter((span) => vertical.has(span))], equations, unresolved };
}

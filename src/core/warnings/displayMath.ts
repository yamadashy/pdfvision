import type { PageResult, PageWarning, TextSpan, VectorBox } from '../../types/index.js';
import { assembleDisplayMath } from '../layout/math/index.js';

/**
 * Two-dimensional math the layout pass found but could not read onto one
 * line: a fraction with a piece inside it that belongs to neither part (an
 * unattached script, a nested root), or a bracketed matrix whose rows do
 * not split into the same number of cells. Linearised math reads as
 * `(a + b)/c`; these regions still come out as fragments on separate
 * lines, so the warning names them for a render.
 */
export function detectDisplayMathLayout(
  page: PageResult,
  spans: readonly TextSpan[] | undefined,
  vectorBoxes: readonly VectorBox[] | undefined,
  out: PageWarning[],
): void {
  if (!spans || spans.length === 0 || !vectorBoxes || vectorBoxes.length === 0) return;
  const { unresolved } = assembleDisplayMath(spans, vectorBoxes, page.width);
  if (unresolved.length === 0) return;
  const boxes = unresolved
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((box) => [box.x, box.y, box.width, box.height].map((n) => Math.round(n)).join(','));
  const shown = boxes.slice(0, 3);
  const more = boxes.length > shown.length ? ` and ${boxes.length - shown.length} more` : '';
  out.push({
    code: 'display_math_layout',
    severity: 'warning',
    message: `display math at ${shown.join('; ')}${more} is set in two dimensions (fraction, matrix) that could not be read onto one line — its pieces come out as separate fragments; render the region (--render-region ${shown[0]}) before quoting the formula`,
  });
}

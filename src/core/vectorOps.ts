import type { ImageOps } from './imageBoxes.js';

/**
 * Count non-text vector paint operations in a pdf.js operator list.
 *
 * pdf.js usually wraps path operations in `OPS.constructPath` and stores
 * the real operation (`stroke`, `fill`, `endPath`, etc.) in `args[0]`.
 * Count only path operations that actually paint; clip/endPath-only paths
 * should not make a blank page look visually populated.
 */
export function countVectorPaintOps(
  fnArray: readonly number[],
  argsArray: readonly unknown[][],
  ops: ImageOps,
): number {
  let count = 0;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    if (fn === ops.constructPath) {
      const pathOp = argsArray[i]?.[0];
      if (typeof pathOp === 'number' && ops.pathPaintOps.has(pathOp)) count++;
    } else if (ops.vectorPaintOps.has(fn)) {
      count++;
    }
  }
  return count;
}

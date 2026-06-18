import type { ImageOps } from './imageBoxes.js';

type Matrix6 = [number, number, number, number, number, number];
type Quad = [number, number, number, number];
interface GraphicsState {
  ctm: Matrix6;
  fillColor?: string;
}

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
  pageWidth?: number,
  pageHeight?: number,
  viewMinX = 0,
  viewMinY = 0,
): number {
  let count = 0;
  let ctm: Matrix6 = [1, 0, 0, 1, 0, 0];
  let fillColor: string | undefined;
  const stack: GraphicsState[] = [];
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    if (fn === ops.save) {
      stack.push({ ctm: [...ctm] as Matrix6, fillColor });
    } else if (fn === ops.restore) {
      const popped = stack.pop();
      if (popped) {
        ctm = popped.ctm;
        fillColor = popped.fillColor;
      }
    } else if (fn === ops.transform) {
      const matrix = matrix6(argsArray[i]);
      if (matrix) ctm = multiply(ctm, matrix);
    } else if (fn === ops.formBegin) {
      stack.push({ ctm: [...ctm] as Matrix6, fillColor });
      const matrix = matrix6(argsArray[i]?.[0]);
      if (matrix) ctm = multiply(ctm, matrix);
    } else if (fn === ops.formEnd) {
      const popped = stack.pop();
      if (popped) {
        ctm = popped.ctm;
        fillColor = popped.fillColor;
      }
    } else if (ops.fillColorOps.has(fn)) {
      fillColor = fillColorValue(argsArray[i]);
    } else if (fn === ops.constructPath) {
      const args = argsArray[i];
      const pathOp = args?.[0];
      if (typeof pathOp === 'number' && ops.pathPaintOps.has(pathOp) && hasPaintablePath(args)) {
        if (
          !isWhitePageBackgroundFill(pathOp, args?.[2], ctm, fillColor, ops, pageWidth, pageHeight, viewMinX, viewMinY)
        ) {
          count++;
        }
      }
    } else if (ops.vectorPaintOps.has(fn)) {
      count++;
    }
  }
  return count;
}

function multiply(ctm: Matrix6, m: readonly number[]): Matrix6 {
  return [
    ctm[0] * m[0] + ctm[2] * m[1],
    ctm[1] * m[0] + ctm[3] * m[1],
    ctm[0] * m[2] + ctm[2] * m[3],
    ctm[1] * m[2] + ctm[3] * m[3],
    ctm[0] * m[4] + ctm[2] * m[5] + ctm[4],
    ctm[1] * m[4] + ctm[3] * m[5] + ctm[5],
  ];
}

function matrix6(value: unknown): Matrix6 | undefined {
  if (!Array.isArray(value) || value.length !== 6) return undefined;
  if (!value.every((item) => typeof item === 'number' && Number.isFinite(item))) return undefined;
  return value as Matrix6;
}

function numericQuad(value: unknown): Quad | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const maybe = value as ArrayLike<unknown>;
  if (maybe.length < 4) return undefined;
  const values = [maybe[0], maybe[1], maybe[2], maybe[3]];
  if (!values.every((v) => typeof v === 'number' && Number.isFinite(v))) return undefined;
  return values as Quad;
}

function fillColorValue(args: readonly unknown[] | undefined): string | undefined {
  const first = args?.[0];
  if (typeof first === 'string') return first.toLowerCase();
  return undefined;
}

function isWhiteColor(value: string | undefined): boolean {
  return value === '#fff' || value === '#ffffff' || value === 'white';
}

function bboxToTopLeftBox(
  bbox: Quad,
  ctm: Matrix6,
  pageHeight: number,
  viewMinX: number,
  viewMinY: number,
): { x: number; y: number; width: number; height: number } {
  const [x1, y1, x2, y2] = bbox;
  const [a, b, c, d, e, f] = ctm;
  const corners = [
    [x1, y1],
    [x2, y1],
    [x1, y2],
    [x2, y2],
  ].map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]);
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX - viewMinX,
    y: pageHeight - (maxY - viewMinY),
    width: maxX - minX,
    height: maxY - minY,
  };
}

function isWhitePageBackgroundFill(
  pathOp: number,
  bboxValue: unknown,
  ctm: Matrix6,
  fillColor: string | undefined,
  ops: ImageOps,
  pageWidth: number | undefined,
  pageHeight: number | undefined,
  viewMinX: number,
  viewMinY: number,
): boolean {
  if (!pageWidth || !pageHeight || !ops.pathFillOps.has(pathOp) || !isWhiteColor(fillColor)) return false;
  const bbox = numericQuad(bboxValue);
  if (!bbox) return false;
  const box = bboxToTopLeftBox(bbox, ctm, pageHeight, viewMinX, viewMinY);
  const tolerance = 1;
  return (
    box.x <= tolerance &&
    box.y <= tolerance &&
    box.x + box.width >= pageWidth - tolerance &&
    box.y + box.height >= pageHeight - tolerance
  );
}

function hasPaintablePath(args: readonly unknown[] | undefined): boolean {
  if (!args) return false;
  const pathData = args[1];
  if (Array.isArray(pathData) && pathData[0] == null) return false;
  if (args.length >= 3 && args[2] == null) return false;
  return true;
}

import type { VectorBox } from '../types/index.js';
import type { ImageOps } from './imageBoxes.js';

type Matrix6 = [number, number, number, number, number, number];
type Quad = [number, number, number, number];
interface GraphicsState {
  ctm: Matrix6;
  fillColor?: string;
}
const MIN_VECTOR_BOX_SIZE = 0.5;

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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function numericQuad(value: unknown): Quad | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const maybe = value as ArrayLike<unknown>;
  if (maybe.length < 4) return undefined;
  const values = [maybe[0], maybe[1], maybe[2], maybe[3]];
  if (!values.every((v) => typeof v === 'number' && Number.isFinite(v))) return undefined;
  return values as Quad;
}

function matrix6(value: unknown): Matrix6 | undefined {
  if (!Array.isArray(value) || value.length !== 6) return undefined;
  if (!value.every((item) => typeof item === 'number' && Number.isFinite(item))) return undefined;
  return value as Matrix6;
}

function bboxToBox(bbox: Quad, ctm: Matrix6, pageHeight: number, viewMinX: number, viewMinY: number): VectorBox {
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
  const width = maxX - minX;
  const height = maxY - minY;
  const xPad = width >= MIN_VECTOR_BOX_SIZE ? 0 : (MIN_VECTOR_BOX_SIZE - width) / 2;
  const yPad = height >= MIN_VECTOR_BOX_SIZE ? 0 : (MIN_VECTOR_BOX_SIZE - height) / 2;
  const boxMinX = minX - xPad;
  const boxMaxX = maxX + xPad;
  const boxMinY = minY - yPad;
  const boxMaxY = maxY + yPad;
  return {
    x: round2(boxMinX - viewMinX),
    y: round2(pageHeight - (boxMaxY - viewMinY)),
    width: round2(boxMaxX - boxMinX),
    height: round2(boxMaxY - boxMinY),
  };
}

export function buildVectorBoxes(
  fnArray: number[],
  argsArray: unknown[][],
  ops: ImageOps,
  pageWidth: number,
  pageHeight: number,
  viewMinX: number,
  viewMinY: number,
): VectorBox[] {
  const boxes: VectorBox[] = [];
  let ctm: Matrix6 = [1, 0, 0, 1, 0, 0];
  let fillColor: string | undefined;
  let pendingClipBox: VectorBox | undefined;
  const stack: GraphicsState[] = [];

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];

    if (fn === ops.save) {
      stack.push({ ctm: [...ctm] as Matrix6, fillColor });
    } else if (fn === ops.restore) {
      const popped = stack.pop();
      if (popped) {
        ctm = popped.ctm;
        fillColor = popped.fillColor;
      }
      pendingClipBox = undefined;
    } else if (fn === ops.transform) {
      const matrix = matrix6(args);
      if (matrix) ctm = multiply(ctm, matrix);
    } else if (fn === ops.formBegin) {
      stack.push({ ctm: [...ctm] as Matrix6, fillColor });
      const matrix = matrix6(args?.[0]);
      if (matrix) ctm = multiply(ctm, matrix);
    } else if (fn === ops.formEnd) {
      const popped = stack.pop();
      if (popped) {
        ctm = popped.ctm;
        fillColor = popped.fillColor;
      }
      pendingClipBox = undefined;
    } else if (ops.fillColorOps.has(fn)) {
      fillColor = fillColorValue(args);
    } else if (fn === ops.constructPath) {
      const pathOp = args?.[0];
      const bbox = numericQuad(args?.[2]);
      if (typeof pathOp === 'number' && ops.pathPaintOps.has(pathOp) && bbox) {
        pendingClipBox = undefined;
        const box = bboxToBox(bbox, ctm, pageHeight, viewMinX, viewMinY);
        if (!isWhitePageBackgroundFill(pathOp, box, fillColor, ops, pageWidth, pageHeight)) {
          boxes.push(box);
        }
      } else if (bbox) {
        pendingClipBox = bboxToBox(bbox, ctm, pageHeight, viewMinX, viewMinY);
      } else {
        pendingClipBox = undefined;
      }
    } else if (fn === ops.shadingFill) {
      if (pendingClipBox) {
        boxes.push(pendingClipBox);
        pendingClipBox = undefined;
      }
    }
  }
  return boxes;
}

function fillColorValue(args: readonly unknown[] | undefined): string | undefined {
  const first = args?.[0];
  if (typeof first === 'string') return first.toLowerCase();
  return undefined;
}

function isWhiteColor(value: string | undefined): boolean {
  return value === '#fff' || value === '#ffffff' || value === 'white';
}

function isWhitePageBackgroundFill(
  pathOp: number,
  box: VectorBox,
  fillColor: string | undefined,
  ops: ImageOps,
  pageWidth: number,
  pageHeight: number,
): boolean {
  if (!ops.pathFillOps.has(pathOp) || !isWhiteColor(fillColor)) return false;
  const tolerance = 1;
  return (
    box.x <= tolerance &&
    box.y <= tolerance &&
    box.x + box.width >= pageWidth - tolerance &&
    box.y + box.height >= pageHeight - tolerance
  );
}

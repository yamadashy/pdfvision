import type { ImageBox } from '../types/index.js';

/**
 * The pdf.js opcode constants we dispatch on. Resolved from `OPS` once and
 * passed in so this module stays decoupled from pdf.js's runtime import.
 *
 * The set is split by emit semantics:
 *   - `singleImageOps` — emit one bbox at the unit-square mapped through CTM.
 *   - the four `*Repeat` / `*Group` opcodes are distinct entry points; each
 *     carries its own per-instance args layout (see {@link buildImageBoxes}).
 *   - `formBegin` / `formEnd` push/pop the CTM stack and apply the form
 *     matrix when entering, so images drawn inside a Form XObject land in
 *     the right place on the page.
 */
export interface ImageOps {
  save: number;
  restore: number;
  transform: number;
  formBegin: number;
  formEnd: number;
  setFillColorN: number;
  /** Fill-color setters that clear an image-bearing tiling pattern. */
  fillColorOps: ReadonlySet<number>;
  /** Image draws that count as a single instance per op (paintImage*, paintInlineImage*, paintImageMaskXObject). */
  singleImageOps: Set<number>;
  /** pdf.js wraps path painting in constructPath and stores the actual path op as args[0]. */
  constructPath: number;
  /** Path operations that actually paint pixels when they appear inside constructPath. */
  pathPaintOps: ReadonlySet<number>;
  /** Path paint operations that fill an area, including fill+stroke variants. */
  pathFillOps: ReadonlySet<number>;
  /** Direct vector drawing operations that expose non-text, non-raster structure. */
  vectorPaintOps: ReadonlySet<number>;
  /** Shading fill operations paint gradients through the active clip path. */
  shadingFill: number;
  paintImageXObjectRepeat: number;
  paintImageMaskXObjectRepeat: number;
  paintImageMaskXObjectGroup: number;
  paintInlineImageXObjectGroup: number;
}

type Matrix6 = [number, number, number, number, number, number];
type Quad = [number, number, number, number];

/** ctm × m, using pdf.js's right-multiply convention. */
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

/** Round to 2dp — matches the rest of the public bbox payload. */
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

/**
 * Convert a 6-element matrix `m` (assumed to map the image unit square)
 * into a top-down page-space {@link ImageBox}. `m` is the *effective* CTM
 * for one image instance: the running CTM right-multiplied by the
 * per-instance transform.
 *
 * Image XObjects are rendered into the unit square (0,0)→(1,1) in their
 * own coords. Mapping the four corners through `m` and taking the axis-
 * aligned bbox gives the page-space rectangle covered, which we then flip
 * to a top-down origin so callers can overlay it on the rendered PNG.
 */
function unitSquareToBox(m: Matrix6, pageHeight: number, viewMinX: number, viewMinY: number): ImageBox {
  const [a, b, c, d, e, f] = m;
  const xs = [e, a + e, c + e, a + c + e];
  const ys = [f, b + f, d + f, b + d + f];
  const xMinPdf = Math.min(...xs);
  const xMaxPdf = Math.max(...xs);
  const yMinPdf = Math.min(...ys);
  const yMaxPdf = Math.max(...ys);
  return {
    x: round2(xMinPdf - viewMinX),
    y: round2(pageHeight - (yMaxPdf - viewMinY)),
    width: round2(xMaxPdf - xMinPdf),
    height: round2(yMaxPdf - yMinPdf),
  };
}

function bboxToBox(bbox: Quad, ctm: Matrix6, pageHeight: number, viewMinX: number, viewMinY: number): ImageBox {
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
    x: round2(minX - viewMinX),
    y: round2(pageHeight - (maxY - viewMinY)),
    width: round2(maxX - minX),
    height: round2(maxY - minY),
  };
}

function isImagePaintOp(fn: number, ops: ImageOps): boolean {
  return (
    ops.singleImageOps.has(fn) ||
    fn === ops.paintImageXObjectRepeat ||
    fn === ops.paintImageMaskXObjectRepeat ||
    fn === ops.paintImageMaskXObjectGroup ||
    fn === ops.paintInlineImageXObjectGroup
  );
}

function operatorListHasImagePaint(value: unknown, ops: ImageOps, depth = 0): boolean {
  if (!value || typeof value !== 'object' || depth > 3) return false;
  const maybe = value as { fnArray?: ArrayLike<unknown>; argsArray?: ArrayLike<unknown> };
  if (!maybe.fnArray || typeof maybe.fnArray.length !== 'number') return false;

  for (let i = 0; i < maybe.fnArray.length; i++) {
    const fn = maybe.fnArray[i];
    if (typeof fn !== 'number') continue;
    if (isImagePaintOp(fn, ops)) return true;
    if (fn === ops.setFillColorN && setFillColorNHasImagePattern(maybe.argsArray?.[i], ops, depth + 1)) return true;
  }
  return false;
}

function setFillColorNHasImagePattern(args: unknown, ops: ImageOps, depth = 0): boolean {
  if (!Array.isArray(args)) return false;
  return args.some((arg) => {
    if (operatorListHasImagePaint(arg, ops, depth)) return true;
    if (!Array.isArray(arg)) return false;
    return arg.some((nested) => operatorListHasImagePaint(nested, ops, depth + 1));
  });
}

/**
 * Walk a pdf.js operator list with a graphics-state stack and emit one
 * {@link ImageBox} per drawn image instance.
 *
 * The walker honours four sources of CTM change:
 *
 *   1. `save` / `restore` — push/pop the running CTM (implicit identity transform).
 *   2. `transform` — right-multiply its 6-element argument into the CTM.
 *   3. `paintFormXObjectBegin` — push the CTM, then right-multiply the form
 *      matrix arg so subsequent draws inside the Form XObject land in the
 *      right page-space position. The optional `bbox` arg is ignored for
 *      bbox-extraction (clipping doesn't move images, and the bbox can
 *      shrink the visible region but rarely meaningfully so).
 *   4. `paintFormXObjectEnd` — pop the CTM stack.
 *
 * Per-instance dispatch follows the pdf.js arg layouts emitted by
 * `QueueOptimizer` (worker-side):
 *
 *   - `paintImageXObjectRepeat` args: `[objId, scaleX, scaleY, positions]`
 *     where `positions[2k..2k+1]` are the (e, f) translations. Each
 *     instance's effective transform is `[scaleX, 0, 0, scaleY, e, f]`.
 *   - `paintImageMaskXObjectRepeat` args: `[img, scaleX, skewX, skewY, scaleY, positions]`.
 *     Same per-instance translation, but the per-instance transform
 *     carries skews: `[scaleX, skewX, skewY, scaleY, e, f]`.
 *   - `paintImageMaskXObjectGroup` args: `[images]`, where `images[k].transform`
 *     is the full 6-element transform for that instance.
 *   - `paintInlineImageXObjectGroup` args: `[imgData, map]`, where
 *     `map[k].transform` is the full per-instance transform.
 *
 * Single-instance opcodes (`paintImageXObject`, `paintInlineImageXObject`,
 * `paintImageMaskXObject`) emit one bbox at the current CTM.
 *
 * Returns one bbox per drawn instance. The returned array length is the
 * "true" per-instance image count for the page.
 */
export function buildImageBoxes(
  fnArray: number[],
  argsArray: unknown[][],
  ops: ImageOps,
  pageHeight: number,
  viewMinX: number,
  viewMinY: number,
): ImageBox[] {
  const boxes: ImageBox[] = [];
  let ctm: Matrix6 = [1, 0, 0, 1, 0, 0];
  const stack: Matrix6[] = [];
  let fillPatternHasImage = false;

  const emit = (perInstance: Matrix6 | null): void => {
    const eff = perInstance === null ? ctm : multiply(ctm, perInstance);
    boxes.push(unitSquareToBox(eff, pageHeight, viewMinX, viewMinY));
  };

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];

    if (fn === ops.save) {
      stack.push([...ctm] as Matrix6);
    } else if (fn === ops.restore) {
      const popped = stack.pop();
      if (popped) ctm = popped;
    } else if (fn === ops.transform) {
      ctm = multiply(ctm, args as number[]);
    } else if (fn === ops.formBegin) {
      // Form XObject: push current CTM, then apply the form matrix so
      // operators inside the form land at the right spot on the page.
      stack.push([...ctm] as Matrix6);
      const matrix = args?.[0];
      if (Array.isArray(matrix) && matrix.length === 6) {
        ctm = multiply(ctm, matrix as number[]);
      }
    } else if (fn === ops.formEnd) {
      const popped = stack.pop();
      if (popped) ctm = popped;
    } else if (fn === ops.setFillColorN) {
      fillPatternHasImage = setFillColorNHasImagePattern(args, ops);
    } else if (ops.fillColorOps.has(fn)) {
      fillPatternHasImage = false;
    } else if (fn === ops.constructPath) {
      const pathOp = args?.[0];
      const bbox = numericQuad(args?.[2]);
      if (fillPatternHasImage && typeof pathOp === 'number' && ops.pathFillOps.has(pathOp) && bbox) {
        boxes.push(bboxToBox(bbox, ctm, pageHeight, viewMinX, viewMinY));
      }
    } else if (ops.singleImageOps.has(fn)) {
      emit(null);
    } else if (fn === ops.paintImageXObjectRepeat) {
      const a = args as [unknown, number, number, ArrayLike<number>];
      const scaleX = a[1];
      const scaleY = a[2];
      const positions = a[3];
      for (let p = 0; p + 1 < positions.length; p += 2) {
        emit([scaleX, 0, 0, scaleY, positions[p], positions[p + 1]]);
      }
    } else if (fn === ops.paintImageMaskXObjectRepeat) {
      const a = args as [unknown, number, number, number, number, ArrayLike<number>];
      const scaleX = a[1];
      const skewX = a[2];
      const skewY = a[3];
      const scaleY = a[4];
      const positions = a[5];
      for (let p = 0; p + 1 < positions.length; p += 2) {
        emit([scaleX, skewX, skewY, scaleY, positions[p], positions[p + 1]]);
      }
    } else if (fn === ops.paintImageMaskXObjectGroup) {
      const images = (args as [Array<{ transform: number[] }>])[0];
      for (const img of images) {
        if (Array.isArray(img.transform) && img.transform.length === 6) {
          emit(img.transform as unknown as Matrix6);
        }
      }
    } else if (fn === ops.paintInlineImageXObjectGroup) {
      const map = (args as [unknown, Array<{ transform: number[] }>])[1];
      for (const entry of map) {
        if (Array.isArray(entry.transform) && entry.transform.length === 6) {
          emit(entry.transform as unknown as Matrix6);
        }
      }
    }
  }
  return boxes;
}

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
  /** Image draws that count as a single instance per op (paintImage*, paintInlineImage*, paintImageMaskXObject). */
  singleImageOps: Set<number>;
  paintImageXObjectRepeat: number;
  paintImageMaskXObjectRepeat: number;
  paintImageMaskXObjectGroup: number;
  paintInlineImageXObjectGroup: number;
}

type Matrix6 = [number, number, number, number, number, number];

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

/**
 * The coordinate frame every pdfvision geometry field is reported in: the
 * page as a viewer displays it, after `/Rotate`, with a top-left origin,
 * y growing downward, and raw (pre-UserUnit) lengths.
 *
 * Extraction code converts PDF user space to this frame with the
 * `(pageHeight, viewMinX, viewMinY)` triple: `x - viewMinX`,
 * `pageHeight - (y - viewMinY)`. For an unrotated page that triple comes
 * straight from `page.view`. For a rotated page, pdf.js inputs are first
 * mapped through {@link DisplayFrame.transform} into a virtual upright
 * page whose box starts at the origin, so the same triple — now
 * `(displayHeight, 0, 0)` — lands every consumer in the displayed frame
 * without each one learning about rotation.
 */

export type Matrix6 = [number, number, number, number, number, number];

export interface DisplayFrame {
  /** Clockwise page rotation normalized to 0, 90, 180 or 270. */
  rotation: 0 | 90 | 180 | 270;
  /** Displayed width in raw units (the stored height for 90/270). */
  width: number;
  /** Displayed height in raw units. */
  height: number;
  /** Height fed to the top-left flip in extraction helpers. */
  pageHeight: number;
  viewMinX: number;
  viewMinY: number;
  /** Top edge in the same space as `viewMinY`; the renderer flips against it. */
  viewMaxY: number;
  /**
   * PDF user space → virtual upright y-up space, present only when the
   * page is rotated. Unrotated pages keep the `page.view` offsets instead
   * so their output stays bit-for-bit what it was before rotation support.
   */
  transform?: Matrix6;
}

export function normalizeRotation(rotation: number | undefined): DisplayFrame['rotation'] {
  if (typeof rotation !== 'number' || !Number.isFinite(rotation)) return 0;
  const normalized = (((Math.round(rotation / 90) * 90) % 360) + 360) % 360;
  return normalized as DisplayFrame['rotation'];
}

export function pageDisplayFrame(view: readonly number[], rotation: number | undefined): DisplayFrame {
  const xMin = Math.min(view[0], view[2]);
  const xMax = Math.max(view[0], view[2]);
  const yMin = Math.min(view[1], view[3]);
  const yMax = Math.max(view[1], view[3]);
  const storedWidth = xMax - xMin;
  const storedHeight = yMax - yMin;
  const normalized = normalizeRotation(rotation);
  if (normalized === 0) {
    return {
      rotation: 0,
      width: storedWidth,
      height: storedHeight,
      pageHeight: storedHeight,
      viewMinX: xMin,
      viewMinY: yMin,
      viewMaxY: yMax,
    };
  }
  const quarterTurn = normalized === 90 || normalized === 270;
  const width = quarterTurn ? storedHeight : storedWidth;
  const height = quarterTurn ? storedWidth : storedHeight;
  // x' = a·x + c·y + e, y' = b·x + d·y + f, mapping the stored page box
  // onto [0, width] × [0, height] turned the way pdf.js's viewport turns it.
  const transform: Matrix6 =
    normalized === 90
      ? [0, -1, 1, 0, -yMin, xMax]
      : normalized === 180
        ? [-1, 0, 0, -1, xMax, yMax]
        : [0, 1, -1, 0, yMax, -xMin];
  return {
    rotation: normalized,
    width,
    height,
    pageHeight: height,
    viewMinX: 0,
    viewMinY: 0,
    viewMaxY: height,
    transform,
  };
}

/** Apply `m` to a point. */
export function applyMatrix(m: Matrix6, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** `m1 × m2`: apply `m2` first, then `m1` (pdf.js `Util.transform`). */
export function multiplyMatrix(m1: Matrix6, m2: readonly number[]): Matrix6 {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/** PDF user-space point → displayed-frame top-left point. */
export function pdfPointToFrame(frame: DisplayFrame, x: number, y: number): [number, number] {
  const [vx, vy] = frame.transform ? applyMatrix(frame.transform, x, y) : [x, y];
  return [vx - frame.viewMinX, frame.viewMaxY - vy];
}

/** Displayed-frame top-left point → PDF user-space point. */
export function framePointToPdf(frame: DisplayFrame, u: number, v: number): [number, number] {
  const vx = u + frame.viewMinX;
  const vy = frame.viewMaxY - v;
  if (!frame.transform) return [vx, vy];
  // The rotation part is orthonormal, so its inverse is its transpose.
  const [a, b, c, d, e, f] = frame.transform;
  const dx = vx - e;
  const dy = vy - f;
  return [a * dx + b * dy, c * dx + d * dy];
}

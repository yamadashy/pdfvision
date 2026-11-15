/**
 * Per-glyph text geometry replayed from a pdf.js operator list.
 *
 * pdf.js text content merges adjacent text-show operations into one item
 * per line, so a box over three words in a sentence cannot be told apart
 * from a box beside the sentence at that granularity. The operator list
 * still carries every glyph's advance width, and the text state needed to
 * place it is a handful of operators, so this module replays the same
 * arithmetic pdf.js's canvas renderer uses (`CanvasGraphics.showText`) and
 * yields one box per glyph in top-left page coordinates.
 *
 * The vertical extent is an em-based approximation (no per-glyph ascent),
 * which is why each glyph also carries a `core` box: the middle of the
 * advance from just above the baseline to roughly x-height, the part of a
 * glyph a covering box must hide for the glyph to be unreadable.
 */

export type Matrix6 = [number, number, number, number, number, number];

export interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GlyphGeometry {
  text: string;
  whitespace: boolean;
  /** Approximate full glyph cell: descent to ascent over the advance. */
  box: PageBox;
  /** Glyph body a cover must hide (see module comment). */
  core: PageBox;
  /** Em size in page units, used for gap and line-break tests. */
  em: number;
}

export interface TextGlyphOps {
  beginText?: number;
  setFont?: number;
  setTextMatrix?: number;
  moveText?: number;
  setLeadingMoveText?: number;
  nextLine?: number;
  setLeading?: number;
  setCharSpacing?: number;
  setWordSpacing?: number;
  setHScale?: number;
  setTextRise?: number;
}

export interface FontGeometryInfo {
  fontMatrix?: readonly number[];
  vertical?: boolean;
}

export type FontGeometryResolver = (loadedName: string) => FontGeometryInfo | undefined;

export interface TextState {
  textMatrix: Matrix6;
  x: number;
  y: number;
  lineX: number;
  lineY: number;
  fontName: string | undefined;
  fontSize: number;
  charSpacing: number;
  wordSpacing: number;
  hScale: number;
  leading: number;
  rise: number;
  /** False after a run whose advance could not be replayed, until the next Tm/BT. */
  positionKnown: boolean;
}

const IDENTITY: Matrix6 = [1, 0, 0, 1, 0, 0];
const FONT_IDENTITY_MATRIX: readonly number[] = [0.001, 0, 0, 0.001, 0, 0];
const DESCENT_EM = 0.22;
const ASCENT_EM = 0.78;
const CORE_BOTTOM_EM = 0.08;
const CORE_TOP_EM = 0.45;
const CORE_INSET = 0.2;

export function initialTextState(): TextState {
  return {
    textMatrix: [...IDENTITY] as Matrix6,
    x: 0,
    y: 0,
    lineX: 0,
    lineY: 0,
    fontName: undefined,
    fontSize: 0,
    charSpacing: 0,
    wordSpacing: 0,
    hScale: 1,
    leading: 0,
    rise: 0,
    positionKnown: true,
  };
}

export function cloneTextState(state: TextState): TextState {
  return { ...state, textMatrix: [...state.textMatrix] as Matrix6 };
}

/** Apply a text-state operator. Returns true when `fn` was one. */
export function applyTextStateOp(
  state: TextState,
  fn: number,
  args: readonly unknown[] | undefined,
  ops: TextGlyphOps,
): boolean {
  if (fn === ops.beginText) {
    state.textMatrix = [...IDENTITY] as Matrix6;
    state.x = state.lineX = 0;
    state.y = state.lineY = 0;
    state.positionKnown = true;
  } else if (fn === ops.setTextMatrix) {
    const matrix = matrixFrom(args?.[0]) ?? matrixFrom(args);
    if (matrix) {
      state.textMatrix = matrix;
      state.positionKnown = true;
    } else {
      state.positionKnown = false;
    }
    state.x = state.lineX = 0;
    state.y = state.lineY = 0;
  } else if (fn === ops.moveText) {
    moveText(state, finite(args?.[0]), finite(args?.[1]));
  } else if (fn === ops.setLeadingMoveText) {
    const y = finite(args?.[1]);
    state.leading = y;
    moveText(state, finite(args?.[0]), y);
  } else if (fn === ops.nextLine) {
    moveText(state, 0, state.leading);
  } else if (fn === ops.setLeading) {
    state.leading = -finite(args?.[0]);
  } else if (fn === ops.setCharSpacing) {
    state.charSpacing = finite(args?.[0]);
  } else if (fn === ops.setWordSpacing) {
    state.wordSpacing = finite(args?.[0]);
  } else if (fn === ops.setHScale) {
    state.hScale = finite(args?.[0], 100) / 100;
  } else if (fn === ops.setTextRise) {
    state.rise = finite(args?.[0]);
  } else if (fn === ops.setFont) {
    state.fontName = typeof args?.[0] === 'string' ? args[0] : undefined;
    state.fontSize = finite(args?.[1]);
  } else {
    return false;
  }
  return true;
}

/**
 * Place the glyphs of one pdf.js `showText` argument and advance the text
 * position. Returns undefined (and marks the position unknown) when the
 * run cannot be placed faithfully: no font size, a negative size, vertical
 * writing, or a missing advance width.
 */
export function placeGlyphs(
  state: TextState,
  glyphArgs: unknown,
  ctm: Matrix6,
  resolveFont: FontGeometryResolver | undefined,
  pageHeight: number,
  viewMinX: number,
  viewMinY: number,
): GlyphGeometry[] | undefined {
  if (!Array.isArray(glyphArgs)) return fail(state);
  const font = state.fontName ? resolveFont?.(state.fontName) : undefined;
  const fontMatrix = font?.fontMatrix && font.fontMatrix.length >= 4 ? font.fontMatrix : FONT_IDENTITY_MATRIX;
  const fontSize = state.fontSize;
  if (!state.positionKnown || font?.vertical || !(fontSize > 0) || !(fontMatrix[0] > 0) || !(state.hScale > 0)) {
    return fail(state);
  }
  const widthAdvanceScale = fontSize * fontMatrix[0];
  const em = fontSize * Math.abs(fontMatrix[3]) * 1000;
  const matrix = multiply(ctm, state.textMatrix);
  const baseline = state.y + state.rise;
  const placed: GlyphGeometry[] = [];
  let x = 0;
  for (const glyph of glyphArgs) {
    if (typeof glyph === 'number') {
      if (!Number.isFinite(glyph)) return fail(state);
      x -= (glyph * fontSize) / 1000;
      continue;
    }
    if (!glyph || typeof glyph !== 'object') continue;
    const { unicode, width, isSpace } = glyph as { unicode?: unknown; width?: unknown; isSpace?: unknown };
    if (typeof width !== 'number' || !Number.isFinite(width)) return fail(state);
    const spacing = (isSpace === true ? state.wordSpacing : 0) + state.charSpacing;
    const advance = width * widthAdvanceScale + spacing;
    const text = typeof unicode === 'string' ? unicode : '';
    const left = state.x + x * state.hScale;
    const right = state.x + (x + Math.max(advance, 0)) * state.hScale;
    const inset = (right - left) * CORE_INSET;
    const box = toPageBox(
      [left, baseline - DESCENT_EM * em, right, baseline + ASCENT_EM * em],
      matrix,
      pageHeight,
      viewMinX,
      viewMinY,
    );
    const core = toPageBox(
      [left + inset, baseline + CORE_BOTTOM_EM * em, right - inset, baseline + CORE_TOP_EM * em],
      matrix,
      pageHeight,
      viewMinX,
      viewMinY,
    );
    if (text.length > 0 && isFiniteBox(box) && isFiniteBox(core)) {
      placed.push({
        text,
        whitespace: isSpace === true || text.trim().length === 0,
        box,
        core,
        em: em * matrixScale(matrix),
      });
    }
    x += advance;
  }
  state.x += x * state.hScale;
  return placed;
}

function fail(state: TextState): undefined {
  state.positionKnown = false;
  return undefined;
}

function moveText(state: TextState, x: number, y: number): void {
  state.x = state.lineX += x;
  state.y = state.lineY += y;
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function matrixFrom(value: unknown): Matrix6 | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as ArrayLike<unknown>;
  if (candidate.length !== 6) return undefined;
  const matrix = Array.from(candidate);
  return matrix.every((item) => typeof item === 'number' && Number.isFinite(item)) ? (matrix as Matrix6) : undefined;
}

export function multiply(ctm: Matrix6, matrix: Matrix6): Matrix6 {
  return [
    ctm[0] * matrix[0] + ctm[2] * matrix[1],
    ctm[1] * matrix[0] + ctm[3] * matrix[1],
    ctm[0] * matrix[2] + ctm[2] * matrix[3],
    ctm[1] * matrix[2] + ctm[3] * matrix[3],
    ctm[0] * matrix[4] + ctm[2] * matrix[5] + ctm[4],
    ctm[1] * matrix[4] + ctm[3] * matrix[5] + ctm[5],
  ];
}

function matrixScale([a, b, c, d]: Matrix6): number {
  return Math.sqrt(Math.abs(a * d - b * c));
}

/** Bounding box of a user-space rectangle under `matrix`, in top-left page coordinates. */
export function toPageBox(
  [x1, y1, x2, y2]: readonly [number, number, number, number],
  matrix: Matrix6,
  pageHeight: number,
  viewMinX: number,
  viewMinY: number,
): PageBox {
  const [a, b, c, d, e, f] = matrix;
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
  return { x: minX - viewMinX, y: pageHeight - (maxY - viewMinY), width: maxX - minX, height: maxY - minY };
}

function isFiniteBox(box: PageBox): boolean {
  return (
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height) &&
    box.width >= 0 &&
    box.height >= 0
  );
}

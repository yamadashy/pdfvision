import { applyMatrix, type DisplayFrame, type Matrix6, multiplyMatrix } from './displayFrame.js';

/**
 * Map the pdf.js inputs of one page into the virtual upright page of a
 * rotated {@link DisplayFrame}. Each function returns its input untouched
 * when the page is not rotated, so unrotated extraction is unchanged.
 */

interface TextContentLike {
  items: unknown[];
}

export function textContentInFrame<T extends TextContentLike>(content: T, frame: DisplayFrame): T {
  const m = frame.transform;
  if (!m) return content;
  return {
    ...content,
    items: content.items.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const transform = (item as { transform?: unknown }).transform;
      if (!isMatrix(transform)) return item;
      return { ...item, transform: multiplyMatrix(m, transform) };
    }),
  };
}

export interface OperatorListLike {
  fnArray: number[];
  argsArray: unknown[][];
}

/**
 * Prefix the page's operator list with one `transform` op carrying the
 * frame matrix. Every operator walker starts from an identity CTM and
 * already concatenates `transform` ops, so this one op is all they need
 * to report boxes in the displayed frame.
 */
export function operatorListInFrame(
  opList: OperatorListLike,
  transformOp: number,
  frame: DisplayFrame,
): OperatorListLike {
  const m = frame.transform;
  if (!m) return opList;
  return {
    fnArray: [transformOp, ...opList.fnArray],
    argsArray: [[...m], ...opList.argsArray],
  };
}

/**
 * Rotate the geometry fields pdfvision reads from pdf.js annotation data:
 * `rect`, `quadPoints`, `lineCoordinates`, `vertices` and `inkLists`.
 */
export function annotationsInFrame<T>(annotations: T[], frame: DisplayFrame): T[] {
  const m = frame.transform;
  if (!m) return annotations;
  return annotations.map((annotation) => {
    if (!annotation || typeof annotation !== 'object') return annotation;
    const raw = annotation as Record<string, unknown>;
    const next: Record<string, unknown> = { ...raw };
    if (isNumberList(raw.rect, 4)) next.rect = rectInFrame(m, raw.rect);
    for (const key of ['quadPoints', 'lineCoordinates', 'vertices'] as const) {
      const points = pointsInFrame(m, raw[key]);
      if (points) next[key] = points;
    }
    if (Array.isArray(raw.inkLists)) {
      next.inkLists = raw.inkLists.map((path) => pointsInFrame(m, path) ?? path);
    }
    return next as T;
  });
}

/** Rotate `bbox` entries ([x1, y1, x2, y2] in PDF user space) throughout a pdf.js struct tree. */
export function structTreeInFrame<T>(tree: T, frame: DisplayFrame): T {
  const m = frame.transform;
  if (!m) return tree;
  const visit = (node: unknown): unknown => {
    if (!node || typeof node !== 'object') return node;
    const raw = node as Record<string, unknown>;
    const next: Record<string, unknown> = { ...raw };
    if (isNumberList(raw.bbox, 4) && raw.bbox.length === 4) next.bbox = rectInFrame(m, raw.bbox);
    if (Array.isArray(raw.children)) next.children = raw.children.map(visit);
    return next;
  };
  return visit(tree) as T;
}

function rectInFrame(m: Matrix6, rect: ArrayLike<number>): number[] {
  const [x1, y1] = applyMatrix(m, rect[0], rect[1]);
  const [x2, y2] = applyMatrix(m, rect[2], rect[3]);
  const out = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
  for (let i = 4; i < rect.length; i++) out.push(rect[i]);
  return out;
}

/** Flat [x, y, x, y, …] lists, as pdf.js stores quad points, lines, vertices and ink paths. */
function pointsInFrame(m: Matrix6, value: unknown): number[] | undefined {
  if (!isNumberList(value, 2)) return undefined;
  const out: number[] = [];
  for (let i = 0; i + 1 < value.length; i += 2) {
    const [x, y] = applyMatrix(m, value[i], value[i + 1]);
    out.push(x, y);
  }
  return out;
}

function isMatrix(value: unknown): value is readonly number[] {
  return isNumberList(value, 6);
}

function isNumberList(value: unknown, minLength: number): value is ArrayLike<number> & { length: number } {
  if (!value || typeof value !== 'object') return false;
  const list = value as ArrayLike<unknown>;
  if (typeof list.length !== 'number' || list.length < minLength) return false;
  for (let i = 0; i < list.length; i++) {
    if (typeof list[i] !== 'number' || !Number.isFinite(list[i])) return false;
  }
  return true;
}

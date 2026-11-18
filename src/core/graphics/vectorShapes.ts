/**
 * Path-level geometry of the vector paths a page paints, kept for the
 * detectors that must tell shapes apart: a tick from a diagonal rule, an
 * arrowhead from a small filled box, a chart line from a table rule.
 * `vectorBoxes` keep only bounding boxes; this keeps the vertices, the
 * paint (fill / stroke, colour, line width) and whether each subpath is
 * closed. Internal only: nothing here reaches the public result.
 *
 * Collection is bounded. A path with more vertices than a chart line or a
 * glyph outline needs is skipped, and once a page has given its budget of
 * shapes or vertices the rest are dropped and the set is marked truncated,
 * so a map or a dense technical drawing costs a fixed amount.
 */

/** pdf.js DrawOPS codes inside constructPath args[1][0]. */
const MOVE_TO = 0;
const LINE_TO = 1;
const CURVE_TO = 2;
const QUAD_TO = 3;
const CLOSE = 4;

const MAX_PATH_VERTICES = 256;
const MAX_SHAPES_PER_PAGE = 6000;
const MAX_VERTICES_PER_PAGE = 60000;

export interface VectorSubpath {
  /** Vertices as `[x0, y0, x1, y1, …]` in the page frame (top-left origin); curve control points are dropped. */
  points: number[];
  closed: boolean;
}

export interface VectorShape {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Fill colour (`#rrggbb` as pdf.js reports it) when the path is filled. */
  fill?: string;
  /** Stroke colour when the path is stroked. */
  stroke?: string;
  /** Stroke width in page units; 0 for a fill-only path. */
  lineWidth: number;
  subpaths: VectorSubpath[];
  /** Number of curve segments (Bézier or quadratic) in the path. */
  curves: number;
  /** Paint order on the page. */
  order: number;
}

export interface VectorShapeSet {
  shapes: VectorShape[];
  /** True when the page's paths exceeded the budget and some were not kept. */
  truncated: boolean;
  /** Vertices kept so far, against the page budget. */
  vertexCount: number;
}

export interface ShapePaint {
  fill?: string;
  stroke?: string;
  lineWidth: number;
}

type Matrix6 = readonly [number, number, number, number, number, number];

export function emptyShapeSet(): VectorShapeSet {
  return { shapes: [], truncated: false, vertexCount: 0 };
}

export interface ShapeFrame {
  pageHeight: number;
  viewMinX: number;
  viewMinY: number;
}

/** Record one painted path into `set`, within the page budget. */
export function addVectorShape(
  set: VectorShapeSet,
  pathData: unknown,
  ctm: Matrix6,
  paint: ShapePaint,
  frame: ShapeFrame,
  order: number,
): void {
  if (set.truncated) return;
  const data = pathNumbers(pathData);
  if (!data) return;
  const [a, b, c, d, e, f] = ctm;
  const subpaths: VectorSubpath[] = [];
  let current: VectorSubpath | undefined;
  let vertices = 0;
  let curves = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const push = (ux: number, uy: number) => {
    const x = a * ux + c * uy + e - frame.viewMinX;
    const y = frame.pageHeight - (b * ux + d * uy + f - frame.viewMinY);
    if (!current) {
      current = { points: [], closed: false };
      subpaths.push(current);
    }
    current.points.push(x, y);
    vertices++;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (let i = 0; i < data.length; ) {
    const command = data[i++];
    if (command === MOVE_TO) {
      current = undefined;
      push(data[i], data[i + 1]);
      i += 2;
    } else if (command === LINE_TO) {
      push(data[i], data[i + 1]);
      i += 2;
    } else if (command === CURVE_TO) {
      push(data[i + 4], data[i + 5]);
      curves++;
      i += 6;
    } else if (command === QUAD_TO) {
      push(data[i + 2], data[i + 3]);
      curves++;
      i += 4;
    } else if (command === CLOSE) {
      if (current) current.closed = true;
      current = undefined;
    } else {
      return;
    }
    if (vertices > MAX_PATH_VERTICES) return;
  }
  if (vertices === 0 || !Number.isFinite(minX + minY + maxX + maxY)) return;
  if (set.shapes.length >= MAX_SHAPES_PER_PAGE || set.vertexCount + vertices > MAX_VERTICES_PER_PAGE) {
    set.truncated = true;
    return;
  }
  // A filled subpath is closed whether or not the path says so.
  if (paint.fill !== undefined) for (const subpath of subpaths) subpath.closed = true;
  set.shapes.push({
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    ...(paint.fill !== undefined && { fill: paint.fill }),
    ...(paint.stroke !== undefined && { stroke: paint.stroke }),
    lineWidth: paint.stroke !== undefined ? paint.lineWidth * Math.sqrt(Math.abs(a * d - b * c)) : 0,
    subpaths,
    curves,
    order,
  });
  set.vertexCount += vertices;
}

function pathNumbers(value: unknown): ArrayLike<number> | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const data = value[0] as ArrayLike<unknown> | null | undefined;
  if (!data || typeof data !== 'object' || typeof data.length !== 'number' || data.length === 0) return undefined;
  // Each vertex costs at least three numbers (command, x, y).
  if (data.length > MAX_PATH_VERTICES * 7) return undefined;
  return data as ArrayLike<number>;
}

/** Scale a shape set's geometry (for a PDF /UserUnit). */
export function scaleShapeSet(set: VectorShapeSet, factor: number): VectorShapeSet {
  return {
    truncated: set.truncated,
    vertexCount: set.vertexCount,
    shapes: set.shapes.map((shape) => ({
      ...shape,
      x: shape.x * factor,
      y: shape.y * factor,
      width: shape.width * factor,
      height: shape.height * factor,
      lineWidth: shape.lineWidth * factor,
      subpaths: shape.subpaths.map((subpath) => ({
        closed: subpath.closed,
        points: subpath.points.map((value) => value * factor),
      })),
    })),
  };
}

import { parseHexColor } from './paintColor.js';
import type { VectorShape } from './vectorShapes.js';

/**
 * Shape tests over {@link VectorShape}s. Each one asks for the geometry
 * the mark is drawn with, not just its size: a tick is a stroked open
 * V whose right arm is the longer one, not any small diagonal; an
 * arrowhead is a filled triangle, not any small filled box.
 */

export interface Point {
  x: number;
  y: number;
}

const DEG = Math.PI / 180;

export function vertices(shape: VectorShape, subpath = 0): Point[] {
  const points = shape.subpaths[subpath]?.points ?? [];
  const out: Point[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const point = { x: points[i], y: points[i + 1] };
    const last = out[out.length - 1];
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 0.05) out.push(point);
  }
  // A closed outline often repeats its start as its last vertex.
  if (shape.subpaths[subpath]?.closed && out.length > 2) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) <= 0.05) out.pop();
  }
  return out;
}

export function centre(box: { x: number; y: number; width: number; height: number }): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A fill that a reader sees as no fill: absent, white or near-white. */
export function isBlankFill(fill: string | undefined): boolean {
  if (fill === undefined) return true;
  const rgb = parseHexColor(fill);
  if (!rgb) return false;
  return rgb.every((channel) => channel >= 235);
}

/** A stroked square outline (one closed axis-aligned rectangle), its inside left blank. */
export function isSquareOutline(shape: VectorShape, minSize: number, maxSize: number): boolean {
  if (shape.stroke === undefined || !isBlankFill(shape.fill) || shape.subpaths.length !== 1) return false;
  if (!shape.subpaths[0].closed || shape.curves > 0) return false;
  if (!isSquareish(shape, minSize, maxSize)) return false;
  const points = vertices(shape);
  if (points.length !== 4) return false;
  return points.every((point, i) => {
    const next = points[(i + 1) % points.length];
    return Math.abs(point.x - next.x) <= 0.3 || Math.abs(point.y - next.y) <= 0.3;
  });
}

/** A stroked circle outline: one closed curve (or fine polygon) whose vertices sit on one radius. */
export function isRingOutline(shape: VectorShape, minSize: number, maxSize: number): boolean {
  if (shape.stroke === undefined || !isBlankFill(shape.fill) || shape.subpaths.length !== 1) return false;
  if (!shape.subpaths[0].closed || !isSquareish(shape, minSize, maxSize)) return false;
  return isRound(shape);
}

/** A filled round dot (one closed curve), any colour but blank. */
export function isFilledDot(shape: VectorShape): boolean {
  if (shape.fill === undefined || isBlankFill(shape.fill) || shape.subpaths.length !== 1) return false;
  if (Math.abs(shape.width - shape.height) > Math.max(0.6, shape.width * 0.2)) return false;
  return isRound(shape);
}

function isRound(shape: VectorShape): boolean {
  const points = vertices(shape);
  const curved = shape.curves >= 4 && points.length <= 16;
  const polygon = shape.curves === 0 && points.length >= 12;
  if (!curved && !polygon) return false;
  const c = centre(shape);
  const radius = (shape.width + shape.height) / 4;
  if (radius <= 0) return false;
  return points.every((point) => Math.abs(Math.hypot(point.x - c.x, point.y - c.y) - radius) <= radius * 0.15);
}

function isSquareish(shape: VectorShape, minSize: number, maxSize: number): boolean {
  const { width, height } = shape;
  if (width < minSize || height < minSize || width > maxSize || height > maxSize) return false;
  return Math.max(width, height) <= Math.min(width, height) * 1.25;
}

/** Angle of a segment from the horizontal, 0–90°. */
function slope(a: Point, b: Point): number {
  return Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) / DEG;
}

/**
 * A tick (✓) stroked as an open V: three vertices, the middle one lowest
 * (the page frame grows downward), a short arm falling from the left into
 * it and a longer arm rising to the right, both diagonal, meeting at an
 * angle a hand-drawn or font tick has.
 */
export function isTickStroke(shape: VectorShape): boolean {
  if (shape.stroke === undefined || shape.fill !== undefined || shape.subpaths.length !== 1) return false;
  if (shape.subpaths[0].closed || shape.curves > 0) return false;
  const points = vertices(shape);
  if (points.length !== 3) return false;
  let [a, bottom, c] = points;
  if (a.x > c.x) [a, c] = [c, a];
  const tolerance = Math.max(0.3, shape.height * 0.05);
  if (bottom.y < a.y - tolerance || bottom.y < c.y - tolerance) return false;
  if (!(a.x < bottom.x && bottom.x < c.x)) return false;
  const left = Math.hypot(bottom.x - a.x, bottom.y - a.y);
  const right = Math.hypot(c.x - bottom.x, c.y - bottom.y);
  if (right < left * 1.3 || c.y > a.y) return false;
  const leftSlope = slope(a, bottom);
  const rightSlope = slope(bottom, c);
  if (leftSlope < 20 || leftSlope > 80 || rightSlope < 20 || rightSlope > 80) return false;
  const turn = 180 - leftSlope - rightSlope;
  return turn >= 40 && turn <= 130;
}

/** The diagonal strokes of a shape: open two-vertex subpaths at 25–65° from the horizontal. */
export function diagonalStrokes(shape: VectorShape): Array<[Point, Point]> {
  if (shape.stroke === undefined || shape.fill !== undefined || shape.curves > 0) return [];
  const out: Array<[Point, Point]> = [];
  for (let i = 0; i < shape.subpaths.length; i++) {
    if (shape.subpaths[i].closed) return [];
    const points = vertices(shape, i);
    if (points.length !== 2) return [];
    const angle = slope(points[0], points[1]);
    if (angle < 25 || angle > 65) return [];
    out.push([points[0], points[1]]);
  }
  return out;
}

/** Where two segments cross, if they do. */
export function crossing(s: [Point, Point], t: [Point, Point]): Point | undefined {
  const [p, p2] = s;
  const [q, q2] = t;
  const r = { x: p2.x - p.x, y: p2.y - p.y };
  const u = { x: q2.x - q.x, y: q2.y - q.y };
  const denominator = r.x * u.y - r.y * u.x;
  if (Math.abs(denominator) < 1e-6) return undefined;
  const t1 = ((q.x - p.x) * u.y - (q.y - p.y) * u.x) / denominator;
  const t2 = ((q.x - p.x) * r.y - (q.y - p.y) * r.x) / denominator;
  if (t1 < 0 || t1 > 1 || t2 < 0 || t2 > 1) return undefined;
  return { x: p.x + t1 * r.x, y: p.y + t1 * r.y };
}

/**
 * A filled triangle (one closed subpath of three vertices; a fourth that
 * repeats the first is dropped): the shape of an arrowhead. Which vertex
 * is the tip depends on the line it caps, so the vertices are returned.
 */
export function filledTriangle(shape: VectorShape): Point[] | undefined {
  if (shape.fill === undefined || isBlankFill(shape.fill) || shape.subpaths.length !== 1 || shape.curves > 0) {
    return undefined;
  }
  const points = vertices(shape);
  return points.length === 3 ? points : undefined;
}

/**
 * The tip of a triangle read as an arrowhead pointing along `direction`
 * (a unit vector): the vertex furthest along it, the other two forming a
 * base across it, as long as the head is not a sliver or a flat wedge.
 */
export function arrowTip(
  triangle: readonly Point[],
  direction: Point,
): { apex: Point; base: Point; length: number } | undefined {
  const along = (p: Point) => p.x * direction.x + p.y * direction.y;
  const sorted = [...triangle].sort((a, b) => along(b) - along(a));
  const [apex, b1, b2] = sorted;
  const base = { x: (b1.x + b2.x) / 2, y: (b1.y + b2.y) / 2 };
  const length = Math.hypot(apex.x - base.x, apex.y - base.y);
  if (length <= 0) return undefined;
  const alignment = ((apex.x - base.x) * direction.x + (apex.y - base.y) * direction.y) / length;
  if (alignment < 0.9) return undefined;
  const width = Math.hypot(b1.x - b2.x, b1.y - b2.y);
  if (width < length * 0.3 || width > length * 2.5) return undefined;
  return { apex, base, length };
}

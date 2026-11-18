import { isBlankFill, type Point, vertices } from './shapeKinds.js';
import type { VectorShapeSet } from './vectorShapes.js';

/**
 * The marks of charts that have no bars: the stroked lines of a line
 * chart and the slices of a pie or donut, plus the small swatches a
 * legend keys them with. Bars are already found from bounding boxes
 * (see layout regions); these need the path shapes.
 *
 * - A series line is one stroked open polyline of three vertices or more
 *   that runs steadily left to right across at least 30pt, rising and
 *   falling: not a rule (flat), not a frame (closed), not a zigzag back
 *   over itself.
 * - A pie is three or more filled closed outlines of different colours
 *   that together make a round disc: every vertex lies within the disc's
 *   radius of its centre, and each slice reaches its rim.
 * - A swatch is a small filled square or dot, or a short horizontal stroke,
 *   that a legend sets just left of a series name.
 */

const SERIES_MIN_WIDTH_PT = 30;
const SERIES_MAX_LINE_WIDTH_PT = 8;
const SERIES_MIN_VERTICES = 3;
const PIE_MIN_SLICES = 3;
const PIE_MIN_DIAMETER_PT = 24;
const SWATCH_MAX_PT = 30;
const MAX_PIE_CANDIDATES = 1500;
const SWATCH_LINE_MAX_PT = 40;

export interface SeriesLine {
  points: Point[];
  colour: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PieSlice {
  polygon: Point[];
  colour: string;
}

export interface Pie {
  centre: Point;
  radius: number;
  slices: PieSlice[];
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Swatch {
  colour: string;
  /** `line` for a short stroke (a line chart's legend), `fill` for a square or dot. */
  kind: 'line' | 'fill';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartMarks {
  lines: SeriesLine[];
  pies: Pie[];
  swatches: Swatch[];
}

export function findChartMarks(set: VectorShapeSet | undefined): ChartMarks {
  const marks: ChartMarks = { lines: [], pies: [], swatches: [] };
  if (!set || set.shapes.length === 0) return marks;
  const fills: Array<{ polygon: Point[]; colour: string; x: number; y: number; width: number; height: number }> = [];
  for (const shape of set.shapes) {
    if (shape.stroke !== undefined && isBlankFill(shape.fill) && shape.subpaths.length === 1) {
      const points = vertices(shape);
      if (!shape.subpaths[0].closed && isSeriesLine(points, shape.width, shape.lineWidth)) {
        marks.lines.push({
          points,
          colour: shape.stroke,
          x: shape.x,
          y: shape.y,
          width: shape.width,
          height: shape.height,
        });
        continue;
      }
      if (!shape.subpaths[0].closed && isLegendStroke(points, shape.width)) {
        marks.swatches.push({ colour: shape.stroke, kind: 'line', ...boxOf(shape) });
        continue;
      }
    }
    if (shape.fill !== undefined && !isBlankFill(shape.fill) && shape.subpaths.length === 1) {
      if (shape.width <= SWATCH_MAX_PT && shape.height <= SWATCH_MAX_PT && shape.width >= 3 && shape.height >= 3) {
        if (Math.max(shape.width, shape.height) <= Math.min(shape.width, shape.height) * 1.3) {
          marks.swatches.push({ colour: shape.fill, kind: 'fill', ...boxOf(shape) });
        }
      }
      // A slice reaches from a pie's centre (or hole) to its rim; glyph-sized fills cannot.
      if (Math.max(shape.width, shape.height) >= PIE_MIN_DIAMETER_PT / 2) {
        const polygon = vertices(shape);
        if (polygon.length >= 3 && (shape.curves > 0 || polygon.length >= 6)) {
          fills.push({ polygon, colour: shape.fill, ...boxOf(shape) });
        }
      }
    }
  }
  // A page of thousands of large fills is a map or an illustration, not a pie chart.
  marks.pies = fills.length <= MAX_PIE_CANDIDATES ? findPies(fills) : [];
  return marks;
}

function boxOf(box: { x: number; y: number; width: number; height: number }) {
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

function isSeriesLine(points: readonly Point[], width: number, lineWidth: number): boolean {
  if (
    points.length < SERIES_MIN_VERTICES ||
    width < SERIES_MIN_WIDTH_PT ||
    lineWidth > Math.min(SERIES_MAX_LINE_WIDTH_PT, width / 20)
  ) {
    return false;
  }
  const direction = Math.sign(points[points.length - 1].x - points[0].x);
  if (direction === 0) return false;
  let sloped = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = (points[i].x - points[i - 1].x) * direction;
    if (dx <= 0.5) return false;
    if (Math.abs(points[i].y - points[i - 1].y) > 0.5) sloped++;
  }
  // A step line or a single kink is a connector or a bracket, not a series.
  return sloped >= Math.max(2, (points.length - 1) / 2);
}

function isLegendStroke(points: readonly Point[], width: number): boolean {
  return points.length === 2 && width >= 6 && width <= SWATCH_LINE_MAX_PT && Math.abs(points[0].y - points[1].y) <= 0.3;
}

/** Filled outlines of different colours that make one disc together. */
function findPies(
  fills: ReadonlyArray<{ polygon: Point[]; colour: string; x: number; y: number; width: number; height: number }>,
): Pie[] {
  const pies: Pie[] = [];
  const used = new Set<number>();
  for (let i = 0; i < fills.length; i++) {
    if (used.has(i)) continue;
    // Slices of one pie touch: grow the group from overlapping boxes.
    const group = [i];
    const inGroup = new Set(group);
    for (let k = 0; k < group.length; k++) {
      const a = fills[group[k]];
      for (let j = 0; j < fills.length; j++) {
        if (used.has(j) || inGroup.has(j)) continue;
        const b = fills[j];
        if (a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height) {
          group.push(j);
          inGroup.add(j);
        }
      }
      if (group.length > 40) break;
    }
    if (group.length < PIE_MIN_SLICES || group.length > 40) continue;
    const members = group.map((index) => fills[index]);
    const x = Math.min(...members.map((m) => m.x));
    const y = Math.min(...members.map((m) => m.y));
    const width = Math.max(...members.map((m) => m.x + m.width)) - x;
    const height = Math.max(...members.map((m) => m.y + m.height)) - y;
    if (width < PIE_MIN_DIAMETER_PT || Math.abs(width - height) > Math.max(width, height) * 0.08) continue;
    const c = { x: x + width / 2, y: y + height / 2 };
    const radius = (width + height) / 4;
    const round = members.every(
      (m) =>
        m.polygon.every((p) => Math.hypot(p.x - c.x, p.y - c.y) <= radius * 1.04) &&
        m.polygon.some((p) => Math.hypot(p.x - c.x, p.y - c.y) >= radius * 0.96),
    );
    if (!round) continue;
    if (new Set(members.map((m) => m.colour)).size < PIE_MIN_SLICES) continue;
    for (const index of group) used.add(index);
    pies.push({
      centre: c,
      radius,
      slices: members.map((m) => ({ polygon: m.polygon, colour: m.colour })),
      x,
      y,
      width,
      height,
    });
  }
  return pies;
}

/** Ray casting: is `p` inside the closed polygon? */
export function insidePolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

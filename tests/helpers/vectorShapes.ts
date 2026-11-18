import type { VectorShape, VectorShapeSet } from '../../src/core/graphics/vectorShapes.js';

type Pt = readonly [number, number];

interface ShapeOptions {
  fill?: string;
  stroke?: string;
  lineWidth?: number;
  closed?: boolean;
  curves?: number;
}

let order = 0;

/** A path shape in the page frame from its subpaths' vertices. */
export function shape(subpaths: ReadonlyArray<readonly Pt[]>, options: ShapeOptions = {}): VectorShape {
  const xs = subpaths.flatMap((points) => points.map(([x]) => x));
  const ys = subpaths.flatMap((points) => points.map(([, y]) => y));
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
    ...(options.fill !== undefined && { fill: options.fill }),
    ...(options.stroke !== undefined && { stroke: options.stroke }),
    lineWidth: options.stroke !== undefined ? (options.lineWidth ?? 1) : 0,
    subpaths: subpaths.map((points) => ({
      points: points.flatMap(([px, py]) => [px, py]),
      closed: options.closed ?? options.fill !== undefined,
    })),
    curves: options.curves ?? 0,
    order: order++,
  };
}

export function stroked(points: readonly Pt[], stroke = '#000000', lineWidth = 1): VectorShape {
  return shape([points], { stroke, lineWidth, closed: false });
}

export function rectOutline(x: number, y: number, w: number, h: number, stroke = '#000000'): VectorShape {
  return shape(
    [
      [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ],
    ],
    { stroke, closed: true },
  );
}

export function filledRect(x: number, y: number, w: number, h: number, fill: string): VectorShape {
  return shape(
    [
      [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ],
    ],
    { fill },
  );
}

/** A circle drawn the way PDF producers do: four Bézier arcs (only their end points are kept). */
export function circle(cx: number, cy: number, r: number, options: ShapeOptions): VectorShape {
  return shape(
    [
      [
        [cx - r, cy],
        [cx, cy - r],
        [cx + r, cy],
        [cx, cy + r],
        [cx - r, cy],
      ],
    ],
    { ...options, curves: 4, closed: true },
  );
}

/** A polygon approximating a circle sector from angle a0 to a1 (radians, clockwise from 12 o'clock). */
export function sector(cx: number, cy: number, r: number, a0: number, a1: number, fill: string): VectorShape {
  const points: Pt[] = [[cx, cy]];
  const steps = Math.max(4, Math.ceil((a1 - a0) / 0.1));
  for (let s = 0; s <= steps; s++) {
    const a = a0 + ((a1 - a0) * s) / steps;
    points.push([cx + r * Math.sin(a), cy - r * Math.cos(a)]);
  }
  return shape([points], { fill });
}

export function shapeSet(shapes: VectorShape[], truncated = false): VectorShapeSet {
  return { shapes, truncated, vertexCount: shapes.reduce((sum, s) => sum + s.subpaths.length, 0) };
}

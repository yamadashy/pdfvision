import type { PageAnnotationBox, PageAnnotationPoint } from '../../types/index.js';

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function rectToBox(
  rect: [number, number, number, number],
  pageHeight: number,
  viewMinX: number,
  viewMinY: number,
): PageAnnotationBox {
  const [x1, y1, x2, y2] = rect;
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  return {
    x: round2(minX - viewMinX),
    y: round2(pageHeight - (maxY - viewMinY)),
    width: round2(maxX - minX),
    height: round2(maxY - minY),
  };
}

export function pointToTopLeft(
  x: number,
  y: number,
  pageHeight: number,
  viewMinX: number,
  viewMinY: number,
): PageAnnotationPoint {
  return {
    x: round2(x - viewMinX),
    y: round2(pageHeight - (y - viewMinY)),
  };
}

export function pointsValue(
  value: unknown,
  pageHeight: number,
  viewMinX: number,
  viewMinY: number,
): PageAnnotationPoint[] {
  const values = numericArrayLike(value);
  if (!values || values.length < 2) return [];
  const points: PageAnnotationPoint[] = [];
  for (let i = 0; i + 1 < values.length; i += 2) {
    points.push(pointToTopLeft(values[i], values[i + 1], pageHeight, viewMinX, viewMinY));
  }
  return points;
}

export function inkPathsValue(
  value: unknown,
  pageHeight: number,
  viewMinX: number,
  viewMinY: number,
): PageAnnotationPoint[][] {
  if (!Array.isArray(value)) return [];
  return value.map((path) => pointsValue(path, pageHeight, viewMinX, viewMinY)).filter((path) => path.length > 0);
}

export function quadPointBoxes(
  value: unknown,
  pageHeight: number,
  viewMinX: number,
  viewMinY: number,
): PageAnnotationBox[] {
  const values = numericArrayLike(value);
  if (!values || values.length < 8) return [];

  const boxes: PageAnnotationBox[] = [];
  for (let i = 0; i + 7 < values.length; i += 8) {
    const xs = [values[i], values[i + 2], values[i + 4], values[i + 6]];
    const ys = [values[i + 1], values[i + 3], values[i + 5], values[i + 7]];
    boxes.push(
      rectToBox([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], pageHeight, viewMinX, viewMinY),
    );
  }
  return boxes;
}

export function numericArrayLike(value: unknown, minLength = 0): number[] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const maybe = value as ArrayLike<unknown>;
  const length = typeof maybe.length === 'number' ? maybe.length : Object.keys(value).length;
  if (length < minLength) return undefined;

  const values: number[] = [];
  for (let i = 0; i < length; i++) {
    const v = maybe[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
    values.push(v);
  }
  return values;
}

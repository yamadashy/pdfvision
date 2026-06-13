export interface TextRunGeometryInput {
  transform: readonly number[];
  width: number;
  height: number;
  pageHeight: number;
  viewMinX: number;
  viewMinY: number;
}

export interface TextRunGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

const VECTOR_EPSILON = 1e-6;

export function textMatrixFontSize(transform: readonly number[], fallback = 0): number {
  const a = transform[0] ?? 0;
  const b = transform[1] ?? 0;
  const c = transform[2] ?? 0;
  const d = transform[3] ?? 0;
  const matrixScale = Math.max(Math.hypot(a, b), Math.hypot(c, d));
  return matrixScale > VECTOR_EPSILON ? matrixScale : fallback;
}

export function textRunGeometryFromTransform(input: TextRunGeometryInput): TextRunGeometry {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = input.transform;
  const baseline = unitVector(a, b) ?? [1, 0];
  const normal = unitVector(c, d) ?? [-baseline[1], baseline[0]];
  const fontSize = textMatrixFontSize(input.transform, input.height);
  const glyphHeight = input.height > 0 ? input.height : fontSize;
  const points = [
    [e, f],
    [e + baseline[0] * input.width, f + baseline[1] * input.width],
    [e + normal[0] * glyphHeight, f + normal[1] * glyphHeight],
    [e + baseline[0] * input.width + normal[0] * glyphHeight, f + baseline[1] * input.width + normal[1] * glyphHeight],
  ];
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: round2(minX - input.viewMinX),
    y: round2(input.pageHeight - (maxY - input.viewMinY)),
    width: round2(maxX - minX),
    height: round2(maxY - minY),
    fontSize: round2(fontSize),
  };
}

function unitVector(x: number, y: number): [number, number] | undefined {
  const length = Math.hypot(x, y);
  if (length <= VECTOR_EPSILON) return undefined;
  return [x / length, y / length];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

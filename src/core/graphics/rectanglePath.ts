export type Quad = [number, number, number, number];

const MAX_RECTANGLE_PATH_NUMBERS = 16;

/**
 * pdf.js encodes path geometry in constructPath args[1] using DrawOPS:
 * moveTo=0, lineTo=1, curveTo=2, quadraticCurveTo=3, closePath=4.
 * Only a single axis-aligned rectangle proves that its whole bbox is painted
 * (fill operations implicitly close an open subpath). Complex paths can
 * contain holes or disconnected subpaths, so their aggregate bbox is not
 * positive coverage evidence. The longest accepted encoding is 16 numbers:
 * moveTo, four lineTo commands (the last repeats the start), and closePath.
 */
export function rectanglePathBox(value: unknown): Quad | undefined {
  if (!Array.isArray(value) || value.length !== 1) return undefined;
  const data = arrayLikeNumbers(value[0]);
  if (!data) return undefined;

  const points: Array<readonly [number, number]> = [];
  let pathEnded = false;
  for (let i = 0; i < data.length; ) {
    const command = data[i++];
    if (command === 0 || command === 1) {
      if (pathEnded || i + 1 >= data.length || (command === 0 && points.length > 0)) return undefined;
      const x = data[i++];
      const y = data[i++];
      if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
      points.push([x, y]);
      continue;
    }
    if (command === 4) {
      pathEnded = true;
      continue;
    }
    return undefined;
  }

  if (points.length === 5 && samePoint(points[0], points[4])) points.pop();
  if (points.length !== 4) return undefined;

  const xs = [...new Set(points.map(([x]) => x))];
  const ys = [...new Set(points.map(([, y]) => y))];
  const corners = new Set(points.map(([x, y]) => `${x},${y}`));
  if (xs.length !== 2 || ys.length !== 2 || corners.size !== 4) return undefined;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    if (samePoint(current, next) || (current[0] !== next[0] && current[1] !== next[1])) return undefined;
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return maxX > minX && maxY > minY ? [minX, minY, maxX, maxY] : undefined;
}

export function numericQuad(value: unknown): Quad | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as ArrayLike<unknown>;
  if (candidate.length < 4) return undefined;
  const quad = [candidate[0], candidate[1], candidate[2], candidate[3]];
  return quad.every((item) => typeof item === 'number' && Number.isFinite(item)) ? (quad as Quad) : undefined;
}

function arrayLikeNumbers(value: unknown): number[] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as ArrayLike<unknown>;
  const { length } = candidate;
  if (!Number.isInteger(length) || length <= 0 || length > MAX_RECTANGLE_PATH_NUMBERS) {
    return undefined;
  }
  const data = Array.from(candidate);
  return data.every((item): item is number => typeof item === 'number') ? data : undefined;
}

function samePoint(a: readonly [number, number], b: readonly [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

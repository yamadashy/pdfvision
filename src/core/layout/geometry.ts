export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Round to 2dp — keeps coordinates compact in JSON. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Bounding box that encloses every item in `items`. Each item just needs
 * x / y / width / height — works for spans (line clustering) and lines
 * (block clustering) alike. Returns rounded coords ready for the public shape.
 */
export function unionBox(items: readonly BBox[]): BBox {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    if (item.x < minX) minX = item.x;
    if (item.y < minY) minY = item.y;
    if (item.x + item.width > maxX) maxX = item.x + item.width;
    if (item.y + item.height > maxY) maxY = item.y + item.height;
  }
  return {
    x: round2(minX),
    y: round2(minY),
    width: round2(maxX - minX),
    height: round2(maxY - minY),
  };
}

/** Most common value in `nums` — used for the dominant font size of a line. */
export function mode(nums: number[]): number {
  const counts = new Map<number, number>();
  let best = nums[0];
  let bestCount = 0;
  for (const n of nums) {
    const c = (counts.get(n) ?? 0) + 1;
    counts.set(n, c);
    if (c > bestCount) {
      best = n;
      bestCount = c;
    }
  }
  return best;
}

/**
 * Median of `values`. Returns 0 for an empty array (caller should guard).
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

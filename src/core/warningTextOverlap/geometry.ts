export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function intersectionArea(a: Box, b: Box): number {
  const dx = horizontalIntersectionDepth(a, b);
  const dy = verticalIntersectionDepth(a, b);
  if (dx <= 0 || dy <= 0) return 0;
  return dx * dy;
}

export function horizontalIntersectionDepth(a: Box, b: Box): number {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
}

export function verticalIntersectionDepth(a: Box, b: Box): number {
  return Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
}

export function horizontalOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x;
}

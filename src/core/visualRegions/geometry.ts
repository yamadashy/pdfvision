import type { BoxLike } from './types.js';

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function area(box: BoxLike): number {
  return Math.max(0, box.width) * Math.max(0, box.height);
}

export function pageArea(input: { pageWidth: number; pageHeight: number }): number {
  return Math.max(0, input.pageWidth) * Math.max(0, input.pageHeight);
}

export function areaRatio(box: BoxLike, totalArea: number): number {
  return totalArea > 0 ? area(box) / totalArea : 0;
}

export function isFinitePositiveBox(box: BoxLike): boolean {
  return (
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height) &&
    box.width > 0 &&
    box.height > 0
  );
}

export function unionBox(a: BoxLike, b: BoxLike): BoxLike {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function padAndClamp(box: BoxLike, pageWidth: number, pageHeight: number, padding: number): BoxLike {
  const left = Math.max(0, box.x - padding);
  const top = Math.max(0, box.y - padding);
  const right = Math.min(pageWidth, box.x + box.width + padding);
  const bottom = Math.min(pageHeight, box.y + box.height + padding);
  const x = round2(left);
  const y = round2(top);
  const roundedRight = Math.min(round2(right), floor2(pageWidth));
  const roundedBottom = Math.min(round2(bottom), floor2(pageHeight));
  return {
    x,
    y,
    width: round2(Math.max(0, roundedRight - x)),
    height: round2(Math.max(0, roundedBottom - y)),
  };
}

export function expand(box: BoxLike, amount: number): BoxLike {
  return {
    x: box.x - amount,
    y: box.y - amount,
    width: box.width + amount * 2,
    height: box.height + amount * 2,
  };
}

export function overlapArea(a: BoxLike, b: BoxLike): number {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
}

export function touches(a: BoxLike, b: BoxLike, gap: number): boolean {
  return overlapArea(expand(a, gap), b) > 0;
}

export function overlapOfSmaller(a: BoxLike, b: BoxLike): number {
  const smaller = Math.min(area(a), area(b));
  return smaller > 0 ? overlapArea(a, b) / smaller : 0;
}

export function areaSimilarity(a: BoxLike, b: BoxLike): number {
  const smaller = Math.min(area(a), area(b));
  const larger = Math.max(area(a), area(b));
  return larger > 0 ? smaller / larger : 0;
}

export function visiblePageBox(box: BoxLike, pageWidth: number, pageHeight: number): BoxLike {
  const x1 = Math.max(0, Math.min(pageWidth, box.x));
  const y1 = Math.max(0, Math.min(pageHeight, box.y));
  const x2 = Math.max(0, Math.min(pageWidth, box.x + box.width));
  const y2 = Math.max(0, Math.min(pageHeight, box.y + box.height));
  return {
    x: x1,
    y: y1,
    width: Math.max(0, x2 - x1),
    height: Math.max(0, y2 - y1),
  };
}

export function horizontalOverlapRatio(a: BoxLike, b: BoxLike): number {
  const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  return Math.max(0, overlap) / Math.max(1, Math.min(a.width, b.width));
}

export function verticalOverlapRatio(a: BoxLike, b: BoxLike): number {
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return Math.max(0, overlap) / Math.max(1, Math.min(a.height, b.height));
}

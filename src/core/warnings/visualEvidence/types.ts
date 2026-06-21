import type { ImageBox, VectorBox } from '../../../types/index.js';

export interface VisualWarningContext {
  rasterBackedTextLayer?: boolean;
  optionalContentText?: boolean;
  hasHiddenOptionalContent?: boolean;
  imageBoxes?: ImageBox[];
  vectorBoxes?: VectorBox[];
}

export interface BoxLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clippedArea(a: BoxLike, b: BoxLike): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

export function overlapRatio(a: BoxLike, b: BoxLike): number {
  const areaA = Math.max(0, a.width) * Math.max(0, a.height);
  const areaB = Math.max(0, b.width) * Math.max(0, b.height);
  const denominator = Math.min(areaA, areaB);
  if (denominator <= 0) return 0;
  return clippedArea(a, b) / denominator;
}

import type { FormFieldLabel, FormFieldLabelRelation } from '../../types/index.js';
import type { LabelLine } from './types.js';

export interface BoxLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function makeLabel(line: LabelLine, text: string, relation: FormFieldLabelRelation): FormFieldLabel {
  return {
    text,
    relation,
    x: line.x,
    y: line.y,
    width: line.width,
    height: line.height,
  };
}

export function unionBox(a: BoxLike, b: BoxLike): BoxLike {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function centerX(box: BoxLike): number {
  return box.x + box.width / 2;
}

export function centerY(box: BoxLike): number {
  return box.y + box.height / 2;
}

export function horizontalOverlapRatio(a: BoxLike, b: BoxLike): number {
  const denominator = Math.max(1, Math.min(a.width, b.width));
  return horizontalOverlapWidth(a, b) / denominator;
}

export function horizontalOverlapWidth(a: BoxLike, b: BoxLike): number {
  const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  return Math.max(0, overlap);
}

export function overlapRatio(a: BoxLike, b: BoxLike): number {
  const horizontal = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const vertical = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const overlapArea = Math.max(0, horizontal) * Math.max(0, vertical);
  const denominator = Math.max(1, Math.min(a.width * a.height, b.width * b.height));
  return overlapArea / denominator;
}

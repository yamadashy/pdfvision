import type { SearchMatch } from '../../../types/index.js';
import { round2 } from '../boxes.js';

export function roundedBox(box: { x: number; y: number; width: number; height: number }): SearchMatch['bbox'] {
  return {
    x: round2(box.x),
    y: round2(box.y),
    width: round2(box.width),
    height: round2(box.height),
  };
}

export function cleanContext(value: string, maxLength: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

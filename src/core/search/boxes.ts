import type { Box, SearchLine, SearchOwner } from './types.js';

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function unionBoxes(boxes: readonly Box[]): Box {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return {
    x: round2(minX),
    y: round2(minY),
    width: round2(maxX - minX),
    height: round2(maxY - minY),
  };
}

export function contributingBoxes(line: SearchLine, start: number, end: number): Box[] {
  const out: Box[] = [];
  let i = start;
  while (i < end) {
    const span = line.owners[i];
    if (!span) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < end && line.owners[j] === span) j++;
    const spanStart = firstOwnerIndex(line, span);
    if (spanStart >= 0) {
      out.push(sliceSpanBox(span, i - spanStart, j - spanStart));
    }
    i = j;
  }
  return out;
}

export function isVerticalSearchOwner(span: SearchOwner): boolean {
  return span.height > Math.max(span.width, 1) * 3;
}

function firstOwnerIndex(line: SearchLine, span: SearchOwner): number {
  for (let i = 0; i < line.owners.length; i++) {
    if (line.owners[i] === span) return i;
  }
  return -1;
}

function sliceSpanBox(span: SearchOwner, start: number, end: number): Box {
  const textLength = span.text.length;
  const clampedStart = Math.max(0, Math.min(textLength, start));
  const clampedEnd = Math.max(clampedStart, Math.min(textLength, end));
  if (textLength === 0 || (clampedStart === 0 && clampedEnd === textLength) || span.width <= 0) {
    return { x: round2(span.x), y: round2(span.y), width: round2(span.width), height: round2(span.height) };
  }
  if (isVerticalSearchOwner(span)) {
    const charHeight = span.height / textLength;
    return {
      x: round2(span.x),
      y: round2(span.y + charHeight * clampedStart),
      width: round2(span.width),
      height: round2(charHeight * (clampedEnd - clampedStart)),
    };
  }
  const charWidth = span.width / textLength;
  return {
    x: round2(span.x + charWidth * clampedStart),
    y: round2(span.y),
    width: round2(charWidth * (clampedEnd - clampedStart)),
    height: round2(span.height),
  };
}

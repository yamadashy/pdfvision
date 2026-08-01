import { padAndClamp } from '../visualRegions/geometry.js';
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

const DOT_LEADER_RE = /(?:\.\s*){4,}/u;

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
  const dotLeaderSlice = sliceDotLeaderLabelBox(span, clampedStart, clampedEnd);
  if (dotLeaderSlice) return dotLeaderSlice;
  const charWidth = span.width / textLength;
  return {
    x: round2(span.x + charWidth * clampedStart),
    y: round2(span.y),
    width: round2(charWidth * (clampedEnd - clampedStart)),
    height: round2(span.height),
  };
}

function sliceDotLeaderLabelBox(span: SearchOwner, start: number, end: number): Box | undefined {
  const match = DOT_LEADER_RE.exec(span.text);
  if (!match || start >= match.index || end > match.index) return undefined;
  const fontSize = span.fontSize ?? span.height;
  if (fontSize <= 0) return undefined;

  const label = span.text.slice(0, match.index);
  const maxLabelWidth = Math.min(span.width, estimateLatinTextWidth(label, fontSize));
  const uniformCharWidth = span.width / Math.max(1, span.text.length);
  const startX = Math.max(uniformCharWidth * start, estimateLatinTextWidth(label.slice(0, start), fontSize));
  const endX = Math.max(uniformCharWidth * end, estimateLatinTextWidth(label.slice(0, end), fontSize));
  const clampedStartX = Math.min(maxLabelWidth, startX);
  const clampedEndX = Math.min(maxLabelWidth, Math.max(clampedStartX, endX));
  if (clampedEndX <= clampedStartX) return undefined;

  return {
    x: round2(span.x + clampedStartX),
    y: round2(span.y),
    width: round2(clampedEndX - clampedStartX),
    height: round2(span.height),
  };
}

function estimateLatinTextWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const char of text) {
    if (/\s/u.test(char)) units += 0.28;
    else if (/[ilI.,:;|!]/u.test(char)) units += 0.28;
    else if (/[mwMW]/u.test(char)) units += 0.78;
    else if (/[A-Z0-9]/u.test(char)) units += 0.62;
    else if (/[a-z]/u.test(char)) units += 0.5;
    else units += 0.55;
  }
  return units * fontSize;
}

/**
 * Minimum and proportional padding applied when turning a located box
 * into something worth rasterising. Wider than tall on purpose — see
 * {@link padAndClamp}.
 */
const CROP_MIN_PAD_X_PT = 60;
const CROP_MIN_PAD_Y_PT = 12;
const CROP_PAD_RATIO_X = 0.6;
const CROP_PAD_RATIO_Y = 0.3;

/**
 * Turn a located box — a search hit, a warning's block, a form widget —
 * into a crop-ready region for `renderRegion`.
 *
 * A match bbox hugs its glyphs, so rendering it verbatim produces an
 * unreadable sliver with no surrounding context. This is the padding step
 * the README's "search → zoom → render" loop describes; `renderRegion`
 * rejects out-of-bounds rectangles rather than clipping them, hence the
 * clamp. Shares `padAndClamp` with visual-region cropping so both produce
 * boxes in the same rounded, in-page form.
 */
export function cropRegionForBox(box: Box, page: { width: number; height: number }): Box {
  const padded = padAndClamp(box, page.width, page.height, {
    x: Math.max(CROP_MIN_PAD_X_PT, box.width * CROP_PAD_RATIO_X),
    y: Math.max(CROP_MIN_PAD_Y_PT, box.height * CROP_PAD_RATIO_Y),
  });
  return { x: padded.x, y: padded.y, width: padded.width, height: padded.height };
}

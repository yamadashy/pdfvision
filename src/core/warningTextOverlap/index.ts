import type { ImageBox, LayoutBlock, PageResult, PageWarning } from '../../types/index.js';
import { boxesIntersect } from './geometry.js';
import { textOverlapArea } from './overlapArea.js';
import { shouldSuppressTextOverlapPair } from './suppressions.js';

const TEXT_OVERLAP_MAX_DETAILED_WARNINGS = 8;
const RASTER_FIGURE_MIN_AREA_RATIO = 0.015;
const RASTER_FIGURE_MAX_AREA_RATIO = 0.45;
const RASTER_FIGURE_TEXT_CONTAINMENT_RATIO = 0.8;

interface TextOverlapCandidate {
  blockIndex: number;
  otherBlockIndex: number;
  overlapArea: number;
}

export { horizontalOverlap } from './geometry.js';

export function detectTextOverlap(
  blocks: LayoutBlock[],
  out: PageWarning[],
  imageBoxes: readonly ImageBox[] = [],
  page?: Pick<PageResult, 'width' | 'height'>,
): void {
  const overlaps: TextOverlapCandidate[] = [];
  let overlapCount = 0;
  // Only non-repeated pairs: repeated chrome legitimately occupies margins,
  // and `body_near_repeated_chrome` covers the body/footer collision case.
  for (let i = 0; i < blocks.length; i++) {
    const a = blocks[i];
    if (a.repeated) continue;
    for (let j = i + 1; j < blocks.length; j++) {
      const b = blocks[j];
      if (b.repeated) continue;
      if (!boxesIntersect(a, b)) continue;
      if (shouldSuppressTextOverlapPair(a, b)) continue;
      if (page && shouldSuppressRasterFigureTextPair(a, b, imageBoxes, page)) continue;
      const overlapArea = textOverlapArea(a, b);
      if (overlapArea < 1) continue;
      overlapCount += 1;
      rememberTopTextOverlap(overlaps, { blockIndex: i, otherBlockIndex: j, overlapArea });
    }
  }
  emitTextOverlapWarnings(overlaps, overlapCount, out);
}

function rememberTopTextOverlap(overlaps: TextOverlapCandidate[], candidate: TextOverlapCandidate): void {
  overlaps.push(candidate);
  overlaps.sort(compareTextOverlapCandidates);
  if (overlaps.length > TEXT_OVERLAP_MAX_DETAILED_WARNINGS) overlaps.pop();
}

function compareTextOverlapCandidates(a: TextOverlapCandidate, b: TextOverlapCandidate): number {
  return b.overlapArea - a.overlapArea || a.blockIndex - b.blockIndex || a.otherBlockIndex - b.otherBlockIndex;
}

function emitTextOverlapWarnings(overlaps: TextOverlapCandidate[], overlapCount: number, out: PageWarning[]): void {
  const sorted = [...overlaps].sort(compareTextOverlapCandidates);
  for (const overlap of sorted.slice(0, TEXT_OVERLAP_MAX_DETAILED_WARNINGS)) {
    out.push({
      code: 'text_overlap',
      severity: 'warning',
      message: `block bboxes overlap (${overlap.overlapArea.toFixed(1)}pt²) — text from different blocks may visually collide`,
      blockIndex: overlap.blockIndex,
      otherBlockIndex: overlap.otherBlockIndex,
    });
  }
  const omitted = overlapCount - sorted.length;
  if (omitted <= 0) return;
  out.push({
    code: 'text_overlap',
    severity: 'warning',
    message: `${omitted} additional block bbox overlap${omitted === 1 ? '' : 's'} omitted after showing the ${TEXT_OVERLAP_MAX_DETAILED_WARNINGS} largest overlaps`,
  });
}

function shouldSuppressRasterFigureTextPair(
  a: LayoutBlock,
  b: LayoutBlock,
  imageBoxes: readonly ImageBox[],
  page: Pick<PageResult, 'width' | 'height'>,
): boolean {
  if (imageBoxes.length === 0 || page.width <= 0 || page.height <= 0) return false;
  const pageArea = page.width * page.height;
  for (const image of imageBoxes) {
    const imageAreaRatio = (Math.max(0, image.width) * Math.max(0, image.height)) / pageArea;
    if (imageAreaRatio < RASTER_FIGURE_MIN_AREA_RATIO || imageAreaRatio > RASTER_FIGURE_MAX_AREA_RATIO) continue;
    if (containedAreaRatio(a, image) < RASTER_FIGURE_TEXT_CONTAINMENT_RATIO) continue;
    if (containedAreaRatio(b, image) < RASTER_FIGURE_TEXT_CONTAINMENT_RATIO) continue;
    return true;
  }
  return false;
}

function containedAreaRatio(block: LayoutBlock, image: ImageBox): number {
  const blockArea = Math.max(0, block.width) * Math.max(0, block.height);
  if (blockArea <= 0) return 0;
  const left = Math.max(block.x, image.x);
  const top = Math.max(block.y, image.y);
  const right = Math.min(block.x + block.width, image.x + image.width);
  const bottom = Math.min(block.y + block.height, image.y + image.height);
  const contained = Math.max(0, right - left) * Math.max(0, bottom - top);
  return contained / blockArea;
}

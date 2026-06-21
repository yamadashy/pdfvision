import { areaRatio, isFinitePositiveBox, pageArea, unionBox, visiblePageBox } from './geometry.js';
import {
  hasSubstantialForegroundRaster,
  isLikelyHorizontalChrome,
  isLikelySideChrome,
  isNearFullPageBox,
  isUsableBox,
} from './predicates.js';
import type { BoxLike, BuildVisualRegionsInput, Candidate } from './types.js';
import { hasDenseVectorStructure } from './vectorCandidates.js';

const MIN_IMAGE_AREA_RATIO = 0.015;
const SMALL_RASTER_TEXT_STRIP_MIN_HEIGHT_PT = 8;
const SMALL_RASTER_TEXT_STRIP_MAX_HEIGHT_PT = 36;
const SMALL_RASTER_TEXT_STRIP_MIN_WIDTH_PT = 70;
const SMALL_RASTER_TEXT_STRIP_SINGLE_MIN_WIDTH_RATIO = 0.18;
const SMALL_RASTER_TEXT_STRIP_CLUSTER_MIN_WIDTH_RATIO = 0.12;
const SMALL_RASTER_TEXT_STRIP_MIN_ASPECT_RATIO = 3.5;
const SMALL_RASTER_TEXT_STRIP_CLUSTER_GAP_PT = 12;
const SMALL_RASTER_TEXT_FRAGMENT_MIN_WIDTH_PT = 2;

export function addRasterCandidates(input: BuildVisualRegionsInput, candidates: Candidate[]): void {
  const totalArea = pageArea(input);
  const hasForegroundRaster = hasSubstantialForegroundRaster(input.imageBoxes, input.pageWidth, input.pageHeight);
  let hasDenseVectorForeground: boolean | undefined;
  for (const [index, box] of input.imageBoxes.entries()) {
    if (!isUsableBox(box)) continue;
    if (isLikelySideChrome(box, input.pageWidth, input.pageHeight)) continue;
    if (isLikelyHorizontalChrome(box, input.pageWidth, input.pageHeight)) continue;
    const ratio = areaRatio(visiblePageBox(box, input.pageWidth, input.pageHeight), totalArea);
    if (isNearFullPageBox(box, input.pageWidth, input.pageHeight)) {
      if (hasForegroundRaster) continue;
      hasDenseVectorForeground ??= hasDenseVectorStructure(input);
      if (hasDenseVectorForeground) continue;
    }
    const spansWidePage = box.width >= input.pageWidth * 0.3 || box.height >= input.pageHeight * 0.3;
    if (ratio < MIN_IMAGE_AREA_RATIO && !spansWidePage) continue;
    candidates.push({
      ...box,
      kind: 'raster',
      priority: 4,
      reason: `raster image covers ${(ratio * 100).toFixed(1)}% of the page`,
      sources: [{ type: 'imageBox', index }],
    });
  }
  addSmallRasterTextStripCandidates(input, candidates);
}

function addSmallRasterTextStripCandidates(input: BuildVisualRegionsInput, candidates: Candidate[]): void {
  const totalArea = pageArea(input);
  const items = input.imageBoxes
    .map((box, index) => {
      const visible = visiblePageBox(box, input.pageWidth, input.pageHeight);
      return { box: visible, index, strong: isSmallRasterTextStripBox(visible, input.pageWidth, input.pageHeight) };
    })
    .filter(({ box }) => {
      if (!isSmallRasterTextFragmentBox(box, input.pageWidth, input.pageHeight)) return false;
      const ratio = areaRatio(box, totalArea);
      return ratio < MIN_IMAGE_AREA_RATIO;
    })
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);

  const clusters: { box: BoxLike; items: typeof items }[] = [];
  for (const item of items) {
    const cluster = clusters.find((candidate) => canShareSmallRasterTextStripCluster(candidate.box, item.box));
    if (cluster) {
      cluster.box = unionBox(cluster.box, item.box);
      cluster.items.push(item);
    } else {
      clusters.push({ box: item.box, items: [item] });
    }
  }

  for (const cluster of clusters) {
    if (!cluster.items.some((item) => item.strong)) continue;
    const widthRatio = input.pageWidth > 0 ? cluster.box.width / input.pageWidth : 0;
    const minWidthRatio =
      cluster.items.length > 1
        ? SMALL_RASTER_TEXT_STRIP_CLUSTER_MIN_WIDTH_RATIO
        : SMALL_RASTER_TEXT_STRIP_SINGLE_MIN_WIDTH_RATIO;
    if (cluster.box.width < SMALL_RASTER_TEXT_STRIP_MIN_WIDTH_PT && widthRatio < minWidthRatio) continue;
    if (widthRatio < minWidthRatio) continue;

    candidates.push({
      ...cluster.box,
      kind: 'raster',
      priority: 2,
      reason:
        cluster.items.length === 1
          ? 'small horizontal raster text strip'
          : `${cluster.items.length} small raster text fragments in one horizontal band`,
      sources: cluster.items.map(({ index }) => ({ type: 'imageBox', index })),
    });
  }
}

function isSmallRasterTextStripBox(box: BoxLike, pageWidth: number, pageHeight: number): boolean {
  if (!isSmallRasterTextFragmentBox(box, pageWidth, pageHeight)) return false;
  return box.width / Math.max(1, box.height) >= SMALL_RASTER_TEXT_STRIP_MIN_ASPECT_RATIO;
}

function isSmallRasterTextFragmentBox(box: BoxLike, pageWidth: number, pageHeight: number): boolean {
  if (!isFinitePositiveBox(box)) return false;
  if (isLikelySideChrome(box, pageWidth, pageHeight)) return false;
  if (isLikelyHorizontalChrome(box, pageWidth, pageHeight)) return false;
  if (box.width < SMALL_RASTER_TEXT_FRAGMENT_MIN_WIDTH_PT) return false;
  if (box.height < SMALL_RASTER_TEXT_STRIP_MIN_HEIGHT_PT || box.height > SMALL_RASTER_TEXT_STRIP_MAX_HEIGHT_PT) {
    return false;
  }
  return true;
}

function canShareSmallRasterTextStripCluster(a: BoxLike, b: BoxLike): boolean {
  const verticalOverlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const minHeight = Math.min(a.height, b.height);
  const centerDistance = Math.abs(a.y + a.height / 2 - (b.y + b.height / 2));
  if (verticalOverlap < minHeight * 0.45 && centerDistance > Math.max(a.height, b.height) * 0.65) return false;

  const horizontalGap = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
  return horizontalGap <= SMALL_RASTER_TEXT_STRIP_CLUSTER_GAP_PT;
}

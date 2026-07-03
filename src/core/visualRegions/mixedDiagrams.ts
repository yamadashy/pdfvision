import type { VisualRegionSource } from '../../types/index.js';
import { areaRatio, isFinitePositiveBox, pageArea, unionBox, visiblePageBox } from './geometry.js';
import {
  isLikelyHorizontalChrome,
  isLikelySideChrome,
  isNearFullPageBox,
  isUsableVectorConnectorBox,
} from './predicates.js';
import type { BoxLike, BuildVisualRegionsInput, Candidate } from './types.js';

const MIN_SMALL_RASTER_IMAGES = 3;
const MIN_CONNECTOR_VECTORS = 2;
const MIN_DIAGRAM_AREA_RATIO = 0.03;
const MAX_DIAGRAM_AREA_RATIO = 0.5;
const MIN_DIAGRAM_WIDTH_RATIO = 0.25;
const MIN_DIAGRAM_HEIGHT_RATIO = 0.12;
const MAX_SMALL_RASTER_AREA_RATIO = 0.012;

export function addMixedDiagramCandidate(input: BuildVisualRegionsInput, candidates: Candidate[]): void {
  const rasterItems = smallRasterDiagramItems(input);
  if (rasterItems.length < MIN_SMALL_RASTER_IMAGES) return;

  const rasterField = rasterItems.reduce<BoxLike>((box, item) => unionBox(box, item.box), rasterItems[0].box);
  const vectorItems = connectorVectorItems(input).filter(({ box }) => intersectsExpanded(rasterField, box, 96));
  if (vectorItems.length < MIN_CONNECTOR_VECTORS) return;

  const field = visiblePageBox(
    [...rasterItems, ...vectorItems].reduce<BoxLike>((box, item) => unionBox(box, item.box), rasterItems[0].box),
    input.pageWidth,
    input.pageHeight,
  );
  const totalArea = pageArea(input);
  const ratio = areaRatio(field, totalArea);
  if (ratio < MIN_DIAGRAM_AREA_RATIO || ratio > MAX_DIAGRAM_AREA_RATIO) return;
  if (field.width < input.pageWidth * MIN_DIAGRAM_WIDTH_RATIO) return;
  if (field.height < input.pageHeight * MIN_DIAGRAM_HEIGHT_RATIO) return;

  const sources: VisualRegionSource[] = [
    ...rasterItems.map(({ index }) => ({ type: 'imageBox' as const, index })),
    ...vectorItems.map(({ index }) => ({ type: 'vectorBox' as const, index })),
  ];
  candidates.push({
    ...field,
    kind: 'mixed',
    priority: 3,
    reason: `${rasterItems.length} small raster nodes connected by ${vectorItems.length} vector drawing operations`,
    sources,
  });
}

function smallRasterDiagramItems(input: BuildVisualRegionsInput): { box: BoxLike; index: number }[] {
  const totalArea = pageArea(input);
  return input.imageBoxes
    .map((box, index) => ({ box: visiblePageBox(box, input.pageWidth, input.pageHeight), index }))
    .filter(({ box }) => {
      if (!isFinitePositiveBox(box)) return false;
      if (isNearFullPageBox(box, input.pageWidth, input.pageHeight)) return false;
      if (isLikelySideChrome(box, input.pageWidth, input.pageHeight)) return false;
      if (isLikelyHorizontalChrome(box, input.pageWidth, input.pageHeight)) return false;
      return areaRatio(box, totalArea) <= MAX_SMALL_RASTER_AREA_RATIO;
    });
}

function connectorVectorItems(input: BuildVisualRegionsInput): { box: BoxLike; index: number }[] {
  return (input.vectorBoxes ?? [])
    .map((box, index) => ({ box: visiblePageBox(box, input.pageWidth, input.pageHeight), index }))
    .filter(({ box }) => {
      if (!isUsableVectorConnectorBox(box)) return false;
      if (isLikelySideChrome(box, input.pageWidth, input.pageHeight)) return false;
      if (isLikelyHorizontalChrome(box, input.pageWidth, input.pageHeight)) return false;
      return !isNearFullPageBox(box, input.pageWidth, input.pageHeight);
    });
}

function intersectsExpanded(a: BoxLike, b: BoxLike, padding: number): boolean {
  return (
    a.x - padding <= b.x + b.width &&
    a.x + a.width + padding >= b.x &&
    a.y - padding <= b.y + b.height &&
    a.y + a.height + padding >= b.y
  );
}

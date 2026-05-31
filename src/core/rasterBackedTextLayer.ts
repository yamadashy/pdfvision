import type { ImageBox } from '../types/index.js';

const RASTER_BACKED_TEXT_COVERAGE_THRESHOLD = 0.1;
const FULL_PAGE_RASTER_COVERAGE_THRESHOLD = 0.9;
export const RASTER_BACKED_TEXT_LAYER_MAX_VECTOR_OPS = 12;

interface RasterBackedTextLayerInput {
  imageCount: number;
  vectorCount: number;
  textCoverage: number;
  imageBoxes: readonly ImageBox[];
  pageWidth: number;
  pageHeight: number;
}

export function isRasterBackedTextLayer(input: RasterBackedTextLayerInput): boolean {
  return (
    input.imageCount > 0 &&
    input.vectorCount <= RASTER_BACKED_TEXT_LAYER_MAX_VECTOR_OPS &&
    input.textCoverage >= RASTER_BACKED_TEXT_COVERAGE_THRESHOLD &&
    hasFullPageRasterBackdrop(input.imageBoxes, input.pageWidth, input.pageHeight)
  );
}

function hasFullPageRasterBackdrop(imageBoxes: readonly ImageBox[], pageWidth: number, pageHeight: number): boolean {
  const pageArea = pageWidth * pageHeight;
  if (pageArea <= 0) return false;
  return imageBoxes.some((box) => {
    const x1 = Math.max(0, box.x);
    const y1 = Math.max(0, box.y);
    const x2 = Math.min(pageWidth, box.x + box.width);
    const y2 = Math.min(pageHeight, box.y + box.height);
    const overlap = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    return overlap / pageArea >= FULL_PAGE_RASTER_COVERAGE_THRESHOLD;
  });
}

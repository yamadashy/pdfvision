import type { PageResult } from '../../../types/index.js';
import { type BoxLike, clippedArea } from './types.js';

const LOW_CONTENT_FULL_PAGE_RASTER_RENDER_THRESHOLD = 0.02;
const FULL_PAGE_RASTER_AREA_RATIO_THRESHOLD = 0.9;
const WEAK_OCR_TEXT_CHAR_THRESHOLD = 16;
const WEAK_OCR_CONFIDENCE_THRESHOLD = 0.55;

export function isLowContentFullPageRasterScan(page: PageResult, contextImageBoxes?: readonly BoxLike[]): boolean {
  if (page.charCount > 0) return false;
  if (page.quality.nativeTextStatus !== 'empty_but_visual_content') return false;
  if (page.renderContentRatio === undefined) return false;
  if (page.renderContentRatio > LOW_CONTENT_FULL_PAGE_RASTER_RENDER_THRESHOLD) return false;
  if (!hasWeakOcrSignal(page)) return false;

  const imageBoxes = page.imageBoxes ?? contextImageBoxes;
  if (!imageBoxes || imageBoxes.length === 0) return false;
  const pageArea = page.width * page.height;
  if (pageArea <= 0) return false;

  return imageBoxes.some((box) => {
    const imageArea = clippedArea(box, { x: 0, y: 0, width: page.width, height: page.height });
    return imageArea / pageArea >= FULL_PAGE_RASTER_AREA_RATIO_THRESHOLD;
  });
}

function hasWeakOcrSignal(page: PageResult): boolean {
  if (!page.ocr) return false;
  const text = page.ocr.text.replace(/\s+/gu, ' ').trim();
  if (text.length === 0) return true;
  return text.length <= WEAK_OCR_TEXT_CHAR_THRESHOLD && page.ocr.confidence <= WEAK_OCR_CONFIDENCE_THRESHOLD;
}

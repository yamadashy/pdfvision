import type { PageResult, PageWarning, VectorBox } from '../../../types/index.js';
import { isLowContentFullPageRasterScan } from './lowContentRaster.js';
import { type BoxLike, clippedArea, overlapRatio, type VisualWarningContext } from './types.js';

const DENSE_VECTOR_GRAPHICS_COUNT_THRESHOLD = 250;
const EDGE_HAIRLINE_MAX_THICKNESS = 1.5;
const EDGE_HAIRLINE_MARGIN_RATIO = 0.01;
const EDGE_HAIRLINE_MIN_MARGIN = 2;
const LARGE_RASTER_AREA_RATIO_THRESHOLD = 0.2;
const CAPTIONED_RASTER_AREA_RATIO_THRESHOLD = 0.08;
const CAPTIONED_RASTER_MIN_WIDTH_RATIO = 0.25;
const CAPTIONED_RASTER_MIN_HEIGHT_RATIO = 0.12;
const FIGURE_CAPTION_MAX_GAP_PT = 72;
const FIGURE_CAPTION_PATTERN = /^(?:fig(?:ure)?\.?|chart|graph|map|plate)\s*\d*/iu;
const RASTER_NO_TEXT_AREA_RATIO_THRESHOLD = 0.5;
const AGGREGATE_RASTER_AREA_RATIO_THRESHOLD = 0.2;
const AGGREGATE_RASTER_TILE_MIN_AREA_RATIO = 0.02;
const LARGE_RASTER_TEXT_OVERLAP_RATIO_THRESHOLD = 0.01;

export function detectDenseVectorGraphics(page: PageResult, out: PageWarning[]): void {
  if (page.vectorCount < DENSE_VECTOR_GRAPHICS_COUNT_THRESHOLD) return;
  out.push({
    code: 'dense_vector_graphics',
    severity: 'warning',
    message: `page contains ${page.vectorCount} vector drawing operations — form fields, table rules, chart paths, or diagrams may not be represented in native text; inspect the render if visual structure matters`,
  });
}

export function detectVectorGraphicsWithoutNativeText(
  page: PageResult,
  context: VisualWarningContext,
  out: PageWarning[],
): void {
  if (page.vectorCount <= 0) return;
  if (page.imageCount > 0) return;
  if (page.charCount > 0) return;
  if (page.quality.nativeTextStatus !== 'empty_but_visual_content') return;
  if (page.quality.visualStatus === 'blank') return;
  const vectorBoxes = page.vectorBoxes ?? context.vectorBoxes;
  if (vectorBoxes && vectorBoxes.length > 0 && vectorBoxes.every((box) => isPageEdgeHairline(box, page))) return;
  out.push({
    code: 'vector_graphics_no_native_text',
    severity: 'warning',
    message: `page contains ${page.vectorCount} vector drawing operation${page.vectorCount === 1 ? '' : 's'} but no native text — labels, symbols, or diagrams drawn as paths will not appear in pages[].text; inspect --render, --vector-boxes, or --visual-regions if visual content matters`,
  });
}

export function detectRasterImageWithoutNativeText(
  page: PageResult,
  context: VisualWarningContext,
  out: PageWarning[],
): void {
  const imageBoxes = page.imageBoxes ?? context.imageBoxes;
  if (!imageBoxes || imageBoxes.length === 0) return;
  if (isLowContentFullPageRasterScan(page, imageBoxes)) return;
  if (page.charCount > 0) return;
  if (page.quality.nativeTextStatus !== 'empty_but_visual_content') return;
  if (page.quality.visualStatus === 'blank') return;
  const pageArea = page.width * page.height;
  if (pageArea <= 0) return;

  const exposeImageBoxIndex = page.imageBoxes !== undefined;
  let best: { box: BoxLike; index: number; areaRatio: number } | undefined;
  for (let i = 0; i < imageBoxes.length; i++) {
    const image = imageBoxes[i];
    const imageArea = clippedArea(image, { x: 0, y: 0, width: page.width, height: page.height });
    const areaRatio = imageArea / pageArea;
    if (areaRatio < RASTER_NO_TEXT_AREA_RATIO_THRESHOLD) continue;
    if (best && areaRatio <= best.areaRatio) continue;
    best = { box: image, index: i, areaRatio };
  }
  if (!best) return;

  out.push({
    code: 'raster_image_no_native_text',
    severity: 'warning',
    message: `raster image covers ${(best.areaRatio * 100).toFixed(1)}% of the page but native text is empty — human-visible text inside the image will not appear in pages[].text; compare the render or OCR when exact text matters`,
    ...(exposeImageBoxIndex && { imageBoxIndex: best.index }),
  });
}

export function detectLargeRasterLowTextOverlap(
  page: PageResult,
  context: VisualWarningContext,
  out: PageWarning[],
): void {
  const imageBoxes = page.imageBoxes ?? context.imageBoxes;
  if (!imageBoxes || imageBoxes.length === 0) return;
  if (isLowContentFullPageRasterScan(page, imageBoxes)) return;
  if (!canCompareNativeTextAgainstRaster(page.quality.nativeTextStatus)) return;
  const pageArea = page.width * page.height;
  if (pageArea <= 0) return;

  const textBoxes = page.layout?.blocks ?? page.spans ?? [];
  if (textBoxes.length === 0 && !hasNoOrSparseNativeText(page.quality.nativeTextStatus)) return;
  const exposeImageBoxIndex = page.imageBoxes !== undefined;
  const warnedImages: BoxLike[] = [];
  for (let i = 0; i < imageBoxes.length; i++) {
    const image = imageBoxes[i];
    if (warnedImages.some((warned) => overlapRatio(image, warned) >= 0.95)) continue;
    const imageArea = clippedArea(image, { x: 0, y: 0, width: page.width, height: page.height });
    const imageAreaRatio = imageArea / pageArea;
    const caption = findNearbyFigureCaption(image, textBoxes, page);
    const isCaptionedMediumRaster =
      caption !== undefined &&
      imageAreaRatio >= CAPTIONED_RASTER_AREA_RATIO_THRESHOLD &&
      image.width >= page.width * CAPTIONED_RASTER_MIN_WIDTH_RATIO &&
      image.height >= page.height * CAPTIONED_RASTER_MIN_HEIGHT_RATIO;
    const isLargeRaster = imageAreaRatio >= LARGE_RASTER_AREA_RATIO_THRESHOLD;
    if (!isLargeRaster && !isCaptionedMediumRaster) continue;

    const textOverlap = textBoxes.reduce((sum, box) => sum + clippedArea(box, image), 0);
    const textOverlapRatio = imageArea > 0 ? textOverlap / imageArea : 0;
    if (textOverlapRatio >= LARGE_RASTER_TEXT_OVERLAP_RATIO_THRESHOLD) continue;

    const imageLabel = isLargeRaster ? 'large raster image' : 'captioned raster figure';
    const captionContext = caption ? ` near caption "${caption}"` : '';
    const message =
      textBoxes.length > 0
        ? `${imageLabel} covers ${(imageAreaRatio * 100).toFixed(1)}% of the page${captionContext} with little native-text overlap (${(textOverlapRatio * 100).toFixed(2)}%) — labels, chart text, or map text inside the image will not appear in native text`
        : `${imageLabel} covers ${(imageAreaRatio * 100).toFixed(1)}% of the page while native text is ${page.quality.nativeTextStatus === 'empty_but_visual_content' ? 'empty' : 'sparse'} — labels, chart text, or map text inside the image will not appear in native text`;
    out.push({
      code: 'large_raster_low_text_overlap',
      severity: 'warning',
      message,
      ...(exposeImageBoxIndex && { imageBoxIndex: i }),
    });
    warnedImages.push(image);
  }
  if (warnedImages.length === 0) {
    detectAggregateRasterLowTextOverlap(page, imageBoxes, textBoxes, pageArea, out);
  }
}

function findNearbyFigureCaption(
  image: BoxLike,
  textBoxes: readonly (BoxLike & { text?: string })[],
  page: Pick<PageResult, 'width' | 'height'>,
): string | undefined {
  for (const box of textBoxes) {
    const text = box.text?.replace(/\s+/gu, ' ').trim();
    if (!text || !FIGURE_CAPTION_PATTERN.test(text)) continue;
    const verticalGap = Math.max(box.y - (image.y + image.height), image.y - (box.y + box.height), 0);
    if (verticalGap > FIGURE_CAPTION_MAX_GAP_PT) continue;
    const horizontalOverlap = Math.min(image.x + image.width, box.x + box.width) - Math.max(image.x, box.x);
    if (horizontalOverlap <= Math.min(image.width, box.width) * 0.25) continue;
    if (box.x > page.width || box.y > page.height) continue;
    return text.slice(0, 60);
  }
  return undefined;
}

function isPageEdgeHairline(box: VectorBox, page: Pick<PageResult, 'width' | 'height'>): boolean {
  if (box.width <= 0 || box.height <= 0 || page.width <= 0 || page.height <= 0) return false;
  const thickness = Math.min(box.width, box.height);
  if (thickness > EDGE_HAIRLINE_MAX_THICKNESS) return false;

  const edgeMargin = Math.max(EDGE_HAIRLINE_MIN_MARGIN, Math.min(page.width, page.height) * EDGE_HAIRLINE_MARGIN_RATIO);
  const nearTop = box.y <= edgeMargin;
  const nearBottom = box.y + box.height >= page.height - edgeMargin;
  const nearLeft = box.x <= edgeMargin;
  const nearRight = box.x + box.width >= page.width - edgeMargin;

  if (box.height <= EDGE_HAIRLINE_MAX_THICKNESS) return nearTop || nearBottom;
  if (box.width <= EDGE_HAIRLINE_MAX_THICKNESS) return nearLeft || nearRight;
  return false;
}

function detectAggregateRasterLowTextOverlap(
  page: PageResult,
  imageBoxes: readonly BoxLike[],
  textBoxes: readonly BoxLike[],
  pageArea: number,
  out: PageWarning[],
): void {
  const candidates: BoxLike[] = [];
  for (const image of imageBoxes) {
    const imageArea = clippedArea(image, { x: 0, y: 0, width: page.width, height: page.height });
    const imageAreaRatio = imageArea / pageArea;
    if (imageAreaRatio < AGGREGATE_RASTER_TILE_MIN_AREA_RATIO) continue;
    if (candidates.some((candidate) => overlapRatio(image, candidate) >= 0.95)) continue;
    candidates.push(image);
  }
  if (candidates.length < 2) return;

  const aggregateArea = candidates.reduce(
    (sum, image) => sum + clippedArea(image, { x: 0, y: 0, width: page.width, height: page.height }),
    0,
  );
  const aggregateAreaRatio = aggregateArea / pageArea;
  if (aggregateAreaRatio < AGGREGATE_RASTER_AREA_RATIO_THRESHOLD) return;

  const textOverlap = candidates.reduce(
    (sum, image) => sum + textBoxes.reduce((boxSum, box) => boxSum + clippedArea(box, image), 0),
    0,
  );
  const textOverlapRatio = aggregateArea > 0 ? textOverlap / aggregateArea : 0;
  if (textOverlapRatio >= LARGE_RASTER_TEXT_OVERLAP_RATIO_THRESHOLD) return;

  const nativeText = page.quality.nativeTextStatus === 'empty_but_visual_content' ? 'empty' : 'sparse';
  const textContext =
    textBoxes.length > 0
      ? `with little native-text overlap (${(textOverlapRatio * 100).toFixed(2)}%)`
      : `while native text is ${nativeText}`;
  out.push({
    code: 'large_raster_low_text_overlap',
    severity: 'warning',
    message: `${candidates.length} raster images together cover ${(aggregateAreaRatio * 100).toFixed(1)}% of the page ${textContext} — labels, chart text, map text, or drawing text inside the images will not appear in native text`,
  });
}

function canCompareNativeTextAgainstRaster(status: PageResult['quality']['nativeTextStatus']): boolean {
  return status === 'ok' || hasNoOrSparseNativeText(status);
}

function hasNoOrSparseNativeText(status: PageResult['quality']['nativeTextStatus']): boolean {
  return status === 'empty_but_visual_content' || status === 'sparse_text_with_visual_content';
}

import { isVisuallyDispatchableFormField } from './formCandidates.js';
import { area, areaRatio, isFinitePositiveBox, visiblePageBox } from './geometry.js';
import type { BoxLike, BuildVisualRegionsInput } from './types.js';

const MIN_REGION_DIMENSION_PT = 18;
const MIN_FOREGROUND_RASTER_AREA_RATIO = 0.015;
const MAX_DENSE_MICRO_VECTOR_BOX_AREA_PT = 100;
const MAX_DENSE_MICRO_VECTOR_DIMENSION_PT = 18;
const FORM_WIDGET_LOCAL_ORIGIN_TOLERANCE_PT = 2;
const FORM_WIDGET_VECTOR_DIMENSION_TOLERANCE_PT = 3;
const BACKGROUND_BOX_AREA_RATIO = 0.9;
const BACKGROUND_BOX_SPAN_RATIO = 0.95;
const SIDE_CHROME_MIN_HEIGHT_RATIO = 0.15;
const SIDE_CHROME_MAX_WIDTH_RATIO = 0.08;
const SIDE_CHROME_EDGE_RATIO = 0.1;
const PAGE_EDGE_CHROME_SPAN_RATIO = 0.75;
const PAGE_EDGE_CHROME_THICKNESS_RATIO = 0.16;
const HORIZONTAL_LABEL_BAND_MIN_WIDTH_RATIO = 0.25;
const HORIZONTAL_LABEL_BAND_MAX_HEIGHT_RATIO = 0.12;
const HORIZONTAL_LABEL_BAND_MIN_HEIGHT_PT = 8;
const HORIZONTAL_LABEL_BAND_MIN_ASPECT_RATIO = 8;
const WIDE_TEXT_PANEL_MIN_WIDTH_RATIO = 0.85;
const WIDE_TEXT_PANEL_MIN_HEIGHT_RATIO = 0.12;
const WIDE_TEXT_PANEL_MAX_HEIGHT_RATIO = 0.45;
const WIDE_TEXT_PANEL_EDGE_RATIO = 0.15;
const PAGE_FRAME_MIN_WIDTH_RATIO = 0.7;
const PAGE_FRAME_MIN_HEIGHT_RATIO = 0.7;
const PAGE_FRAME_MIN_AREA_RATIO = 0.5;
const PAGE_FRAME_EDGE_INSET_RATIO = 0.18;

export function isUsableBox(box: BoxLike): boolean {
  return (
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height) &&
    box.width >= MIN_REGION_DIMENSION_PT &&
    box.height >= MIN_REGION_DIMENSION_PT
  );
}

export function isUsableVectorConnectorBox(box: BoxLike): boolean {
  return isFinitePositiveBox(box) && Math.max(box.width, box.height) >= MIN_REGION_DIMENSION_PT;
}

export function isNearFullPageBox(box: BoxLike, pageWidth: number, pageHeight: number): boolean {
  const visible = visiblePageBox(box, pageWidth, pageHeight);
  const totalArea = pageWidth * pageHeight;
  return (
    areaRatio(visible, totalArea) >= BACKGROUND_BOX_AREA_RATIO ||
    (visible.width >= pageWidth * BACKGROUND_BOX_SPAN_RATIO && visible.height >= pageHeight * BACKGROUND_BOX_SPAN_RATIO)
  );
}

export function hasNonBackgroundBox(boxes: readonly BoxLike[], pageWidth: number, pageHeight: number): boolean {
  return boxes.some((box) => isUsableBox(box) && !isBackgroundLikeCandidate(box, pageWidth, pageHeight));
}

export function hasSubstantialForegroundRaster(
  boxes: readonly BoxLike[],
  pageWidth: number,
  pageHeight: number,
): boolean {
  const totalArea = pageWidth * pageHeight;
  return boxes.some((box) => {
    if (!isUsableBox(box) || isBackgroundLikeCandidate(box, pageWidth, pageHeight)) return false;
    return areaRatio(visiblePageBox(box, pageWidth, pageHeight), totalArea) >= MIN_FOREGROUND_RASTER_AREA_RATIO;
  });
}

export function isUsefulDenseVectorBox(box: BoxLike, minLineLengthPt: number): boolean {
  return isFinitePositiveBox(box) && Math.max(box.width, box.height) >= minLineLengthPt;
}

export function isUsefulMicroVectorBox(box: BoxLike): boolean {
  return (
    isFinitePositiveBox(box) &&
    area(box) <= MAX_DENSE_MICRO_VECTOR_BOX_AREA_PT &&
    Math.max(box.width, box.height) <= MAX_DENSE_MICRO_VECTOR_DIMENSION_PT
  );
}

export function isLikelySideChrome(box: BoxLike, pageWidth: number, pageHeight: number): boolean {
  const visible = visiblePageBox(box, pageWidth, pageHeight);
  return (
    visible.height >= pageHeight * SIDE_CHROME_MIN_HEIGHT_RATIO &&
    visible.width <= pageWidth * SIDE_CHROME_MAX_WIDTH_RATIO &&
    (visible.x <= pageWidth * SIDE_CHROME_EDGE_RATIO ||
      visible.x + visible.width >= pageWidth * (1 - SIDE_CHROME_EDGE_RATIO))
  );
}

export function isLikelyHorizontalChrome(box: BoxLike, pageWidth: number, pageHeight: number): boolean {
  const visible = visiblePageBox(box, pageWidth, pageHeight);
  return (
    visible.width >= pageWidth * PAGE_EDGE_CHROME_SPAN_RATIO &&
    visible.height <= pageHeight * PAGE_EDGE_CHROME_THICKNESS_RATIO &&
    (visible.y <= pageHeight * 0.1 || visible.y + visible.height >= pageHeight * 0.9)
  );
}

function isLikelyHorizontalLabelBand(box: BoxLike, pageWidth: number, pageHeight: number): boolean {
  const visible = visiblePageBox(box, pageWidth, pageHeight);
  return (
    visible.width >= pageWidth * HORIZONTAL_LABEL_BAND_MIN_WIDTH_RATIO &&
    visible.height >= HORIZONTAL_LABEL_BAND_MIN_HEIGHT_PT &&
    visible.height <= pageHeight * HORIZONTAL_LABEL_BAND_MAX_HEIGHT_RATIO &&
    visible.width / Math.max(1, visible.height) >= HORIZONTAL_LABEL_BAND_MIN_ASPECT_RATIO
  );
}

function isLikelyWideTextPanelBackplane(box: BoxLike, pageWidth: number, pageHeight: number): boolean {
  const visible = visiblePageBox(box, pageWidth, pageHeight);
  const heightRatio = pageHeight > 0 ? visible.height / pageHeight : 0;
  return (
    visible.width >= pageWidth * WIDE_TEXT_PANEL_MIN_WIDTH_RATIO &&
    heightRatio >= WIDE_TEXT_PANEL_MIN_HEIGHT_RATIO &&
    heightRatio <= WIDE_TEXT_PANEL_MAX_HEIGHT_RATIO &&
    (visible.y <= pageHeight * WIDE_TEXT_PANEL_EDGE_RATIO ||
      visible.y + visible.height >= pageHeight * (1 - WIDE_TEXT_PANEL_EDGE_RATIO))
  );
}

function isLikelyInsetPageFrameBackplane(box: BoxLike, pageWidth: number, pageHeight: number): boolean {
  const visible = visiblePageBox(box, pageWidth, pageHeight);
  const totalArea = pageWidth * pageHeight;
  if (totalArea <= 0) return false;
  return (
    areaRatio(visible, totalArea) >= PAGE_FRAME_MIN_AREA_RATIO &&
    visible.width >= pageWidth * PAGE_FRAME_MIN_WIDTH_RATIO &&
    visible.height >= pageHeight * PAGE_FRAME_MIN_HEIGHT_RATIO &&
    visible.x <= pageWidth * PAGE_FRAME_EDGE_INSET_RATIO &&
    visible.y <= pageHeight * PAGE_FRAME_EDGE_INSET_RATIO &&
    visible.x + visible.width >= pageWidth * (1 - PAGE_FRAME_EDGE_INSET_RATIO) &&
    visible.y + visible.height >= pageHeight * (1 - PAGE_FRAME_EDGE_INSET_RATIO)
  );
}

export function isBackgroundLikeCandidate(box: BoxLike, pageWidth: number, pageHeight: number): boolean {
  return (
    isNearFullPageBox(box, pageWidth, pageHeight) ||
    isLikelySideChrome(box, pageWidth, pageHeight) ||
    isLikelyHorizontalChrome(box, pageWidth, pageHeight)
  );
}

export function isLikelyVectorBackplane(box: BoxLike, pageWidth: number, pageHeight: number): boolean {
  return (
    isBackgroundLikeCandidate(box, pageWidth, pageHeight) ||
    isLikelyHorizontalLabelBand(box, pageWidth, pageHeight) ||
    isLikelyWideTextPanelBackplane(box, pageWidth, pageHeight) ||
    isLikelyInsetPageFrameBackplane(box, pageWidth, pageHeight)
  );
}

export function isLikelyUnpositionedFormWidgetVector(box: BoxLike, input: BuildVisualRegionsInput): boolean {
  const fields = input.formFields?.filter(isVisuallyDispatchableFormField) ?? [];
  if (fields.length < 2) return false;
  const atLocalOrigin =
    box.x <= FORM_WIDGET_LOCAL_ORIGIN_TOLERANCE_PT &&
    Math.abs(box.y + box.height - input.pageHeight) <= FORM_WIDGET_LOCAL_ORIGIN_TOLERANCE_PT;
  if (!atLocalOrigin) return false;
  return fields.some(
    (field) =>
      Math.abs(field.width - box.width) <= FORM_WIDGET_VECTOR_DIMENSION_TOLERANCE_PT &&
      Math.abs(field.height - box.height) <= FORM_WIDGET_VECTOR_DIMENSION_TOLERANCE_PT,
  );
}

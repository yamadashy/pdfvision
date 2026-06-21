import type {
  FormField,
  ImageBox,
  PageAnnotation,
  PageLayout,
  PageQuality,
  VectorBox,
  VisualRegion,
  VisualRegionSource,
} from '../types/index.js';
import { associatedTextKey, MAX_ASSOCIATED_TEXT, mergeAssociatedText } from './visualRegions/associatedText.js';
import { attachCaptionText } from './visualRegions/captions.js';
import { addFormCandidate, isVisuallyDispatchableFormField } from './visualRegions/formCandidates.js';
import {
  area,
  areaRatio,
  areaSimilarity,
  isFinitePositiveBox,
  overlapArea,
  overlapOfSmaller,
  padAndClamp,
  pageArea,
  round3,
  touches,
  unionBox,
  visiblePageBox,
} from './visualRegions/geometry.js';
import {
  attachHeadingLabels,
  attachInRegionPlainLabels,
  attachPlainImageLabels,
  attachTableLeadInLabels,
} from './visualRegions/labels.js';
import { addRuledTableVectorCandidates } from './visualRegions/ruledTables.js';
import type { BoxLike, Candidate } from './visualRegions/types.js';

export interface BuildVisualRegionsInput {
  pageWidth: number;
  pageHeight: number;
  imageBoxes: readonly ImageBox[];
  vectorBoxes?: readonly VectorBox[];
  layout?: PageLayout;
  formFields?: readonly FormField[];
  annotations?: readonly PageAnnotation[];
  visualStatus?: 'ok' | 'sparse' | 'blank';
  nativeTextStatus?: PageQuality['nativeTextStatus'];
}

const REGION_PADDING_PT = 8;
const CLUSTER_GAP_PT = 10;
const MAX_REGIONS = 12;
const MAX_SOURCE_REFS = 16;
const MIN_REGION_DIMENSION_PT = 18;
const MIN_IMAGE_AREA_RATIO = 0.015;
const MIN_FOREGROUND_RASTER_AREA_RATIO = 0.015;
const SMALL_RASTER_TEXT_STRIP_MIN_HEIGHT_PT = 8;
const SMALL_RASTER_TEXT_STRIP_MAX_HEIGHT_PT = 36;
const SMALL_RASTER_TEXT_STRIP_MIN_WIDTH_PT = 70;
const SMALL_RASTER_TEXT_STRIP_SINGLE_MIN_WIDTH_RATIO = 0.18;
const SMALL_RASTER_TEXT_STRIP_CLUSTER_MIN_WIDTH_RATIO = 0.12;
const SMALL_RASTER_TEXT_STRIP_MIN_ASPECT_RATIO = 3.5;
const SMALL_RASTER_TEXT_STRIP_CLUSTER_GAP_PT = 12;
const SMALL_RASTER_TEXT_FRAGMENT_MIN_WIDTH_PT = 2;
const MIN_VECTOR_CLUSTER_SOURCES = 6;
const MIN_VECTOR_CLUSTER_AREA_RATIO = 0.01;
const MIN_DENSE_VECTOR_BOXES = 40;
const MIN_DENSE_VECTOR_CLUSTER_BOXES = 12;
const MIN_DENSE_VECTOR_UNION_AREA_RATIO = 0.03;
const MIN_DENSE_VECTOR_LINE_LENGTH_PT = 18;
const DENSE_VECTOR_CLUSTER_GAP_PT = 24;
const MIN_DENSE_MICRO_VECTOR_BOXES = 200;
const MIN_DENSE_MICRO_VECTOR_CLUSTER_BOXES = 40;
const MIN_DENSE_MICRO_VECTOR_CLUSTER_AREA_RATIO = 0.015;
const MAX_DENSE_MICRO_VECTOR_BOX_AREA_PT = 100;
const MAX_DENSE_MICRO_VECTOR_DIMENSION_PT = 18;
const FORM_BACKPLANE_AREA_RATIO = 0.3;
const FORM_BACKPLANE_SINGLE_FORM_AREA_RATIO = 0.5;
const FORM_BACKPLANE_MIN_FORM_OVERLAPS = 2;
const FORM_WIDGET_LOCAL_ORIGIN_TOLERANCE_PT = 2;
const FORM_WIDGET_VECTOR_DIMENSION_TOLERANCE_PT = 3;
const VECTOR_BACKPLANE_MIN_RASTER_OVERLAPS = 2;
const VECTOR_BACKPLANE_MIN_AREA_RATIO = 0.25;
const BACKGROUND_BOX_AREA_RATIO = 0.9;
const BACKGROUND_BOX_SPAN_RATIO = 0.95;
const SIDE_CHROME_MIN_HEIGHT_RATIO = 0.15;
const SIDE_CHROME_MAX_WIDTH_RATIO = 0.08;
const SIDE_CHROME_EDGE_RATIO = 0.1;
const PAGE_EDGE_CHROME_SPAN_RATIO = 0.8;
const PAGE_EDGE_CHROME_THICKNESS_RATIO = 0.16;
const HORIZONTAL_LABEL_BAND_MIN_WIDTH_RATIO = 0.25;
const HORIZONTAL_LABEL_BAND_MAX_HEIGHT_RATIO = 0.08;
const HORIZONTAL_LABEL_BAND_MIN_HEIGHT_PT = 8;
const HORIZONTAL_LABEL_BAND_MIN_ASPECT_RATIO = 8;
const WIDE_TEXT_PANEL_MIN_WIDTH_RATIO = 0.85;
const WIDE_TEXT_PANEL_MIN_HEIGHT_RATIO = 0.12;
const WIDE_TEXT_PANEL_MAX_HEIGHT_RATIO = 0.45;
const WIDE_TEXT_PANEL_EDGE_RATIO = 0.15;
const EQUIVALENT_CANDIDATE_OVERLAP_RATIO = 0.98;
const EQUIVALENT_CANDIDATE_AREA_RATIO = 0.98;
const CONTEXTUAL_DUPLICATE_OVERLAP_RATIO = 0.85;
const CONTEXTUAL_DUPLICATE_AREA_RATIO = 0.85;
const CONTEXTUAL_DUPLICATE_CONTAINED_OVERLAP_RATIO = 0.95;
const SHALLOW_TABLE_HINT_MAX_ROWS = 2;
const SHALLOW_TABLE_HINT_MAX_HEIGHT_RATIO = 0.1;
const SHALLOW_TABLE_HINT_MIN_WIDTH_RATIO = 0.65;
const OCR_FRAGMENT_TABLE_HINT_MIN_COLUMNS = 20;
const REPEATED_CHROME_EDGE_RATIO = 0.12;
const REPEATED_CHROME_BAND_PADDING_PT = 18;
const REPEATED_CHROME_CANDIDATE_OVERLAP_RATIO = 0.55;

function isUsableBox(box: BoxLike): boolean {
  return (
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height) &&
    box.width >= MIN_REGION_DIMENSION_PT &&
    box.height >= MIN_REGION_DIMENSION_PT
  );
}

function isUsableVectorConnectorBox(box: BoxLike): boolean {
  return isFinitePositiveBox(box) && Math.max(box.width, box.height) >= MIN_REGION_DIMENSION_PT;
}

function isNearFullPageBox(box: BoxLike, pageWidth: number, pageHeight: number): boolean {
  const visible = visiblePageBox(box, pageWidth, pageHeight);
  const totalArea = pageWidth * pageHeight;
  return (
    areaRatio(visible, totalArea) >= BACKGROUND_BOX_AREA_RATIO ||
    (visible.width >= pageWidth * BACKGROUND_BOX_SPAN_RATIO && visible.height >= pageHeight * BACKGROUND_BOX_SPAN_RATIO)
  );
}

function hasNonBackgroundBox(boxes: readonly BoxLike[], pageWidth: number, pageHeight: number): boolean {
  return boxes.some((box) => isUsableBox(box) && !isBackgroundLikeCandidate(box, pageWidth, pageHeight));
}

function hasSubstantialForegroundRaster(boxes: readonly BoxLike[], pageWidth: number, pageHeight: number): boolean {
  const totalArea = pageWidth * pageHeight;
  return boxes.some((box) => {
    if (!isUsableBox(box) || isBackgroundLikeCandidate(box, pageWidth, pageHeight)) return false;
    return areaRatio(visiblePageBox(box, pageWidth, pageHeight), totalArea) >= MIN_FOREGROUND_RASTER_AREA_RATIO;
  });
}

function isUsefulDenseVectorBox(box: BoxLike): boolean {
  return isFinitePositiveBox(box) && Math.max(box.width, box.height) >= MIN_DENSE_VECTOR_LINE_LENGTH_PT;
}

function isUsefulMicroVectorBox(box: BoxLike): boolean {
  return (
    isFinitePositiveBox(box) &&
    area(box) <= MAX_DENSE_MICRO_VECTOR_BOX_AREA_PT &&
    Math.max(box.width, box.height) <= MAX_DENSE_MICRO_VECTOR_DIMENSION_PT
  );
}

function isLikelySideChrome(box: BoxLike, pageWidth: number, pageHeight: number): boolean {
  const visible = visiblePageBox(box, pageWidth, pageHeight);
  return (
    visible.height >= pageHeight * SIDE_CHROME_MIN_HEIGHT_RATIO &&
    visible.width <= pageWidth * SIDE_CHROME_MAX_WIDTH_RATIO &&
    (visible.x <= pageWidth * SIDE_CHROME_EDGE_RATIO ||
      visible.x + visible.width >= pageWidth * (1 - SIDE_CHROME_EDGE_RATIO))
  );
}

function isLikelyHorizontalChrome(box: BoxLike, pageWidth: number, pageHeight: number): boolean {
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

function isBackgroundLikeCandidate(box: BoxLike, pageWidth: number, pageHeight: number): boolean {
  return (
    isNearFullPageBox(box, pageWidth, pageHeight) ||
    isLikelySideChrome(box, pageWidth, pageHeight) ||
    isLikelyHorizontalChrome(box, pageWidth, pageHeight)
  );
}

function isLikelyVectorBackplane(box: BoxLike, pageWidth: number, pageHeight: number): boolean {
  return (
    isBackgroundLikeCandidate(box, pageWidth, pageHeight) ||
    isLikelyHorizontalLabelBand(box, pageWidth, pageHeight) ||
    isLikelyWideTextPanelBackplane(box, pageWidth, pageHeight)
  );
}

function isLikelyUnpositionedFormWidgetVector(box: BoxLike, input: BuildVisualRegionsInput): boolean {
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

function denseVectorItems(input: BuildVisualRegionsInput): { box: VectorBox; index: number }[] {
  return (input.vectorBoxes ?? [])
    .map((box, index) => ({ box, index }))
    .filter(
      ({ box }) =>
        isUsefulDenseVectorBox(box) &&
        !isNearFullPageBox(box, input.pageWidth, input.pageHeight) &&
        !isLikelySideChrome(box, input.pageWidth, input.pageHeight) &&
        !isLikelyHorizontalChrome(box, input.pageWidth, input.pageHeight) &&
        !isLikelyUnpositionedFormWidgetVector(box, input),
    );
}

function denseMicroVectorItems(input: BuildVisualRegionsInput): { box: VectorBox; index: number }[] {
  return (input.vectorBoxes ?? [])
    .map((box, index) => ({ box, index }))
    .filter(
      ({ box }) =>
        isUsefulMicroVectorBox(box) &&
        !isNearFullPageBox(box, input.pageWidth, input.pageHeight) &&
        !isLikelySideChrome(box, input.pageWidth, input.pageHeight) &&
        !isLikelyHorizontalChrome(box, input.pageWidth, input.pageHeight) &&
        !isLikelyUnpositionedFormWidgetVector(box, input),
    );
}

function denseVectorClusters<T extends { box: BoxLike }>(items: readonly T[]): { box: BoxLike; items: T[] }[] {
  const clusters: { box: BoxLike; items: T[] }[] = [];
  for (const item of items) {
    const matches: number[] = [];
    for (let i = 0; i < clusters.length; i++) {
      if (touches(clusters[i].box, item.box, DENSE_VECTOR_CLUSTER_GAP_PT)) matches.push(i);
    }
    if (matches.length === 0) {
      clusters.push({ box: item.box, items: [item] });
      continue;
    }

    const first = matches[0];
    clusters[first] = {
      box: unionBox(clusters[first].box, item.box),
      items: [...clusters[first].items, item],
    };
    for (let i = matches.length - 1; i >= 1; i--) {
      clusters[first] = {
        box: unionBox(clusters[first].box, clusters[matches[i]].box),
        items: [...clusters[first].items, ...clusters[matches[i]].items],
      };
      clusters.splice(matches[i], 1);
    }
  }
  return clusters;
}

function hasDenseVectorStructure(input: BuildVisualRegionsInput): boolean {
  const useful = denseVectorItems(input);
  if (useful.length < MIN_DENSE_VECTOR_BOXES) return false;

  return denseVectorClusters(useful).some(
    (cluster) =>
      cluster.items.length >= MIN_DENSE_VECTOR_CLUSTER_BOXES &&
      areaRatio(cluster.box, pageArea(input)) >= MIN_DENSE_VECTOR_UNION_AREA_RATIO,
  );
}

function sourceKey(source: VisualRegionSource): string {
  return `${source.type}:${source.index}`;
}

function hasSourceType(candidate: Candidate, type: VisualRegionSource['type']): boolean {
  return candidate.sources.some((source) => source.type === type);
}

function mergeSources(sources: readonly VisualRegionSource[]): VisualRegionSource[] {
  const seen = new Set<string>();
  const merged: VisualRegionSource[] = [];
  for (const source of sources) {
    const key = sourceKey(source);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(source);
  }
  return merged.sort((a, b) => (a.type === b.type ? a.index - b.index : a.type.localeCompare(b.type)));
}

function mergeCandidates(a: Candidate, b: Candidate): Candidate {
  const box = unionBox(a, b);
  const sources = mergeSources([...a.sources, ...b.sources]);
  const associatedText = mergeAssociatedText([...(a.associatedText ?? []), ...(b.associatedText ?? [])]);
  return {
    ...box,
    kind: a.kind === b.kind ? a.kind : 'mixed',
    priority: Math.max(a.priority, b.priority),
    reason: a.reason === b.reason ? a.reason : `${a.reason}; ${b.reason}`,
    sources,
    ...(associatedText.length > 0 && { associatedText }),
  };
}

function mergeCandidateMetadataInto(primary: Candidate, duplicate: Candidate): Candidate {
  const sources = mergeSources([...primary.sources, ...duplicate.sources]);
  const associatedText = mergeAssociatedText([...(primary.associatedText ?? []), ...(duplicate.associatedText ?? [])]);
  return {
    ...primary,
    kind: primary.kind === duplicate.kind ? primary.kind : 'mixed',
    priority: Math.max(primary.priority, duplicate.priority),
    reason: mergeCandidateReasons(primary, duplicate, sources),
    sources,
    ...(associatedText.length > 0 && { associatedText }),
  };
}

function mergeCandidateReasons(
  primary: Candidate,
  duplicate: Candidate,
  sources: readonly VisualRegionSource[],
): string {
  if (primary.reason === duplicate.reason) {
    return normalizeMergedReason(primary.reason, sources);
  }
  return normalizeMergedReason(
    mergeReasonsBySourceCoverage(primary, duplicate) ?? `${primary.reason}; ${duplicate.reason}`,
    sources,
  );
}

function normalizeMergedReason(reason: string, sources: readonly VisualRegionSource[]): string {
  const vectorSourceCount = sources.filter((source) => source.type === 'vectorBox').length;
  const segments = reason.split('; ');
  const seen = new Set<string>();
  const normalized: string[] = [];
  let emittedVectorSegment = false;
  for (const segment of segments) {
    if (/^\d+ nearby vector drawing operations$/u.test(segment) && vectorSourceCount > 0) {
      if (!emittedVectorSegment) normalized.push(`${vectorSourceCount} nearby vector drawing operations`);
      emittedVectorSegment = true;
      continue;
    }
    if (seen.has(segment)) continue;
    seen.add(segment);
    normalized.push(segment);
  }
  return normalized.join('; ');
}

function mergeReasonsBySourceCoverage(primary: Candidate, duplicate: Candidate): string | undefined {
  if (primary.reason.startsWith(duplicate.reason)) return primary.reason;
  if (duplicate.reason.startsWith(primary.reason)) return duplicate.reason;
  return undefined;
}

function visualScore(candidate: Candidate, totalArea: number): number {
  const ratio = totalArea > 0 ? area(candidate) / totalArea : 0;
  return candidate.priority * 100 + ratio * 20 + Math.min(candidate.sources.length, 50);
}

function finalizeCandidate(candidate: Candidate, pageWidth: number, pageHeight: number): VisualRegion {
  const box = padAndClamp(candidate, pageWidth, pageHeight, REGION_PADDING_PT);
  const totalArea = pageWidth * pageHeight;
  const sources = mergeSources(candidate.sources);
  const associatedText = mergeAssociatedText(candidate.associatedText ?? []);
  return {
    kind: candidate.kind,
    ...box,
    areaRatio: totalArea > 0 ? round3(area(box) / totalArea) : 0,
    sourceCount: sources.length,
    sources: sources.slice(0, MAX_SOURCE_REFS),
    reason: candidate.reason,
    ...(associatedText.length > 0 && { associatedText: associatedText.slice(0, MAX_ASSOCIATED_TEXT) }),
  };
}

function isUsableFinalCandidate(candidate: Candidate, pageWidth: number, pageHeight: number): boolean {
  return isUsableBox(padAndClamp(candidate, pageWidth, pageHeight, REGION_PADDING_PT));
}

function addRasterCandidates(input: BuildVisualRegionsInput, candidates: Candidate[]): void {
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

function clusterVectorBoxes(
  vectorBoxes: readonly VectorBox[],
  pageWidth: number,
  pageHeight: number,
  skipBackgroundBoxes: boolean,
  input: BuildVisualRegionsInput,
): Candidate[] {
  const clusters: Candidate[] = [];
  for (const [index, box] of vectorBoxes.entries()) {
    const usableRegionBox = isUsableBox(box);
    if (!usableRegionBox && !isUsableVectorConnectorBox(box)) continue;
    if (isLikelySideChrome(box, pageWidth, pageHeight)) continue;
    if (isLikelyHorizontalChrome(box, pageWidth, pageHeight)) continue;
    if (skipBackgroundBoxes && isLikelyVectorBackplane(box, pageWidth, pageHeight)) continue;
    if (isLikelyUnpositionedFormWidgetVector(box, input)) continue;
    const matches: number[] = [];
    for (let i = 0; i < clusters.length; i++) {
      if (touches(clusters[i], box, CLUSTER_GAP_PT)) matches.push(i);
    }
    if (!usableRegionBox && matches.length < 2) continue;
    const next: Candidate = {
      ...box,
      kind: 'vector',
      priority: 2,
      reason: 'cluster of vector drawing operations',
      sources: [{ type: 'vectorBox', index }],
    };
    if (matches.length === 0) {
      if (!usableRegionBox) continue;
      clusters.push(next);
      continue;
    }
    let merged = mergeCandidates(clusters[matches[0]], next);
    for (let i = matches.length - 1; i >= 1; i--) {
      merged = mergeCandidates(merged, clusters[matches[i]]);
      clusters.splice(matches[i], 1);
    }
    clusters[matches[0]] = merged;
  }
  return clusters;
}

function addVectorCandidates(input: BuildVisualRegionsInput, candidates: Candidate[]): void {
  if (!input.vectorBoxes || input.vectorBoxes.length === 0) return;
  const totalArea = pageArea(input);
  const skipBackgroundBoxes =
    hasNonBackgroundBox(input.vectorBoxes, input.pageWidth, input.pageHeight) || hasDenseVectorStructure(input);
  for (const cluster of clusterVectorBoxes(
    input.vectorBoxes,
    input.pageWidth,
    input.pageHeight,
    skipBackgroundBoxes,
    input,
  )) {
    const ratio = areaRatio(cluster, totalArea);
    if (cluster.sources.length < MIN_VECTOR_CLUSTER_SOURCES && ratio < MIN_VECTOR_CLUSTER_AREA_RATIO) continue;
    candidates.push({
      ...cluster,
      reason: `${cluster.sources.length} nearby vector drawing operations`,
    });
  }
  addRuledTableVectorCandidates(
    input,
    candidates,
    (box) =>
      isLikelySideChrome(box, input.pageWidth, input.pageHeight) ||
      isLikelyHorizontalChrome(box, input.pageWidth, input.pageHeight),
  );
  addDenseVectorUnionCandidate(input, candidates);
  addDenseMicroVectorClusterCandidates(input, candidates);
}

function addDenseVectorUnionCandidate(input: BuildVisualRegionsInput, candidates: Candidate[]): void {
  if ((input.vectorBoxes ?? []).length < MIN_DENSE_VECTOR_BOXES) return;
  const useful = denseVectorItems(input);
  if (useful.length < MIN_DENSE_VECTOR_BOXES) return;

  for (const cluster of denseVectorClusters(useful)) {
    if (cluster.items.length < MIN_DENSE_VECTOR_CLUSTER_BOXES) continue;
    const ratio = areaRatio(cluster.box, pageArea(input));
    if (ratio < MIN_DENSE_VECTOR_UNION_AREA_RATIO) continue;

    candidates.push({
      ...cluster.box,
      kind: 'vector',
      priority: 2,
      reason: `${cluster.items.length} vector drawing boxes across dense page structure`,
      sources: cluster.items.map(({ index }) => ({ type: 'vectorBox', index })),
    });
  }
}

function addDenseMicroVectorClusterCandidates(input: BuildVisualRegionsInput, candidates: Candidate[]): void {
  if ((input.vectorBoxes ?? []).length < MIN_DENSE_MICRO_VECTOR_BOXES) return;
  const useful = denseMicroVectorItems(input);
  if (useful.length < MIN_DENSE_MICRO_VECTOR_BOXES) return;

  for (const cluster of denseVectorClusters(useful)) {
    if (cluster.items.length < MIN_DENSE_MICRO_VECTOR_CLUSTER_BOXES) continue;
    const ratio = areaRatio(cluster.box, pageArea(input));
    if (ratio < MIN_DENSE_MICRO_VECTOR_CLUSTER_AREA_RATIO) continue;
    if (isNearFullPageBox(cluster.box, input.pageWidth, input.pageHeight)) continue;

    candidates.push({
      ...cluster.box,
      kind: 'vector',
      priority: 2,
      reason: `${cluster.items.length} dense small vector markers across visual region`,
      sources: cluster.items.map(({ index }) => ({ type: 'vectorBox', index })),
    });
  }
}

function addTableCandidates(
  layout: PageLayout | undefined,
  candidates: Candidate[],
  pageWidth: number,
  pageHeight: number,
): void {
  for (const [index, table] of (layout?.tables ?? []).entries()) {
    if (!isUsableBox(table)) continue;
    if (isLowConfidenceVisualTableHint(table, pageWidth, pageHeight)) continue;
    candidates.push({
      x: table.x,
      y: table.y,
      width: table.width,
      height: table.height,
      kind: 'table',
      priority: 3,
      reason: `layout table hint with ${table.rowCount} rows and ${table.columnCount} columns`,
      sources: [{ type: 'layoutTable', index }],
    });
  }
}

function isLowConfidenceVisualTableHint(
  table: BoxLike & { rowCount: number; columnCount: number },
  pageWidth: number,
  pageHeight: number,
): boolean {
  if (pageWidth <= 0 || pageHeight <= 0) return false;
  if (table.rowCount <= SHALLOW_TABLE_HINT_MAX_ROWS && table.columnCount >= OCR_FRAGMENT_TABLE_HINT_MIN_COLUMNS) {
    return true;
  }
  return (
    table.rowCount <= SHALLOW_TABLE_HINT_MAX_ROWS &&
    table.width >= pageWidth * SHALLOW_TABLE_HINT_MIN_WIDTH_RATIO &&
    table.height <= pageHeight * SHALLOW_TABLE_HINT_MAX_HEIGHT_RATIO
  );
}

function addAnnotationCandidates(annotations: readonly PageAnnotation[] | undefined, candidates: Candidate[]): void {
  if (!annotations || annotations.length === 0) return;
  for (const [index, annotation] of annotations.entries()) {
    if (!isVisuallyDispatchableAnnotation(annotation)) continue;
    const box = annotationVisualBox(annotation);
    if (!box) continue;
    candidates.push({
      ...box,
      kind: 'annotation',
      priority: 3,
      reason: `${annotation.subtype} annotation markup`,
      sources: [{ type: 'annotation', index }],
    });
  }
}

function isVisuallyDispatchableAnnotation(annotation: PageAnnotation): boolean {
  if (annotation.subtype === 'FreeText' && annotation.hasAppearance === false) return false;
  return !annotation.flags?.some((flag) => flag === 'invisible' || flag === 'hidden' || flag === 'noView');
}

function annotationVisualBox(annotation: PageAnnotation): BoxLike | undefined {
  const boxes = (annotation.quadBoxes && annotation.quadBoxes.length > 0 ? annotation.quadBoxes : [annotation]).filter(
    isFinitePositiveBox,
  );
  if (boxes.length === 0) return undefined;
  return boxes.slice(1).reduce<BoxLike>((acc, box) => unionBox(acc, box), boxes[0]);
}

function suppressFormBackplaneCandidates(candidates: Candidate[], totalArea: number): Candidate[] {
  const formCandidates = candidates.filter((candidate) => hasSourceType(candidate, 'formField'));
  if (formCandidates.length === 0) return candidates;

  return candidates.filter((candidate) => {
    if (hasSourceType(candidate, 'formField')) return true;
    if (candidate.kind !== 'vector') return true;
    const candidateAreaRatio = areaRatio(candidate, totalArea);
    if (candidateAreaRatio < FORM_BACKPLANE_AREA_RATIO) return true;
    const overlappingForms = formCandidates.filter((form) => overlapOfSmaller(form, candidate) >= 0.75).length;
    if (candidateAreaRatio >= FORM_BACKPLANE_SINGLE_FORM_AREA_RATIO && overlappingForms >= 1) return false;
    return overlappingForms < FORM_BACKPLANE_MIN_FORM_OVERLAPS;
  });
}

function suppressBroadVectorBackplaneCandidates(candidates: Candidate[], totalArea: number): Candidate[] {
  const rasterCandidates = candidates.filter(isStandaloneRasterCandidate);
  if (rasterCandidates.length < VECTOR_BACKPLANE_MIN_RASTER_OVERLAPS) return candidates;

  return candidates.filter((candidate) => {
    if (!isStandaloneVectorCandidate(candidate)) return true;
    if (areaRatio(candidate, totalArea) < VECTOR_BACKPLANE_MIN_AREA_RATIO) return true;
    const overlappingRasters = rasterCandidates.filter(
      (raster) => overlapOfSmaller(raster, candidate) >= CONTEXTUAL_DUPLICATE_CONTAINED_OVERLAP_RATIO,
    );
    return overlappingRasters.length < VECTOR_BACKPLANE_MIN_RASTER_OVERLAPS;
  });
}

function isStandaloneRasterCandidate(candidate: Candidate): boolean {
  return candidate.kind === 'raster' && candidate.sources.every((source) => source.type === 'imageBox');
}

function isStandaloneVectorCandidate(candidate: Candidate): boolean {
  return candidate.kind === 'vector' && candidate.sources.every((source) => source.type === 'vectorBox');
}

function dedupeCandidates(candidates: Candidate[]): Candidate[] {
  const deduped: Candidate[] = [];
  for (const candidate of candidates) {
    const index = deduped.findIndex((existing) => overlapOfSmaller(existing, candidate) >= 0.75);
    if (index === -1) deduped.push(candidate);
    else deduped[index] = mergeCandidates(deduped[index], candidate);
  }
  return deduped;
}

function dedupeEquivalentCandidates(candidates: Candidate[]): Candidate[] {
  const deduped: Candidate[] = [];
  for (const candidate of candidates) {
    const index = deduped.findIndex(
      (existing) =>
        overlapOfSmaller(existing, candidate) >= EQUIVALENT_CANDIDATE_OVERLAP_RATIO &&
        areaSimilarity(existing, candidate) >= EQUIVALENT_CANDIDATE_AREA_RATIO,
    );
    if (index === -1) deduped.push(candidate);
    else deduped[index] = mergeCandidates(deduped[index], candidate);
  }
  return deduped;
}

function dedupeContextualDuplicates(candidates: Candidate[]): Candidate[] {
  const deduped: Candidate[] = [];
  for (const candidate of candidates) {
    const index = deduped.findIndex((existing) => areContextualDuplicates(existing, candidate));
    if (index === -1) {
      deduped.push(candidate);
      continue;
    }

    const existing = deduped[index];
    const primary = area(candidate) > area(existing) ? candidate : existing;
    const duplicate = primary === candidate ? existing : candidate;
    deduped[index] = mergeCandidateMetadataInto(primary, duplicate);
  }
  return deduped;
}

function areContextualDuplicates(a: Candidate, b: Candidate): boolean {
  if (!shareAssociatedText(a, b)) return false;
  const overlapRatio = overlapOfSmaller(a, b);
  if (overlapRatio < CONTEXTUAL_DUPLICATE_OVERLAP_RATIO) return false;
  if (areaSimilarity(a, b) >= CONTEXTUAL_DUPLICATE_AREA_RATIO) return true;
  return (
    a.kind !== b.kind && shareAssociatedCaption(a, b) && overlapRatio >= CONTEXTUAL_DUPLICATE_CONTAINED_OVERLAP_RATIO
  );
}

function shareAssociatedText(a: Candidate, b: Candidate): boolean {
  if (!a.associatedText || !b.associatedText) return false;
  const aKeys = new Set(a.associatedText.map(associatedTextKey));
  return b.associatedText.some((text) => aKeys.has(associatedTextKey(text)));
}

function shareAssociatedCaption(a: Candidate, b: Candidate): boolean {
  if (!a.associatedText || !b.associatedText) return false;
  const aCaptionKeys = new Set(a.associatedText.filter((text) => text.relation === 'caption').map(associatedTextKey));
  return b.associatedText.some((text) => text.relation === 'caption' && aCaptionKeys.has(associatedTextKey(text)));
}

function suppressBackgroundLikeCandidates(candidates: Candidate[], pageWidth: number, pageHeight: number): Candidate[] {
  const hasForegroundRegion = candidates.some(
    (candidate) => !isSuppressibleBackgroundLikeCandidate(candidate, pageWidth, pageHeight),
  );
  if (!hasForegroundRegion) return candidates;
  return candidates.filter((candidate) => !isSuppressibleBackgroundLikeCandidate(candidate, pageWidth, pageHeight));
}

function isSuppressibleBackgroundLikeCandidate(candidate: Candidate, pageWidth: number, pageHeight: number): boolean {
  if (hasSourceType(candidate, 'layoutTable') || hasSourceType(candidate, 'formField')) return false;
  return isBackgroundLikeCandidate(candidate, pageWidth, pageHeight);
}

function suppressBlankFullPageCandidates(
  candidates: Candidate[],
  pageWidth: number,
  pageHeight: number,
  visualStatus: BuildVisualRegionsInput['visualStatus'],
): Candidate[] {
  if (visualStatus !== 'blank') return candidates;
  return candidates.filter((candidate) => !isNearFullPageBox(candidate, pageWidth, pageHeight));
}

function suppressLoneFullPageVectorBackplanes(candidates: Candidate[], input: BuildVisualRegionsInput): Candidate[] {
  return candidates.filter(
    (candidate) =>
      !(
        candidate.kind === 'vector' &&
        candidate.sources.length === 1 &&
        hasSourceType(candidate, 'vectorBox') &&
        isNearFullPageBox(candidate, input.pageWidth, input.pageHeight) &&
        !isOnlyNonblankVisualEvidence(candidate, input)
      ),
  );
}

function isOnlyNonblankVisualEvidence(candidate: Candidate, input: BuildVisualRegionsInput): boolean {
  return (
    input.nativeTextStatus === 'empty_but_visual_content' &&
    input.visualStatus !== 'blank' &&
    (input.layout?.blocks.length ?? 0) === 0 &&
    input.imageBoxes.length === 0 &&
    candidate.kind === 'vector' &&
    candidate.sources.length === 1 &&
    hasSourceType(candidate, 'vectorBox')
  );
}

function suppressContainedCandidates(candidates: Candidate[]): Candidate[] {
  return candidates.filter(
    (candidate, index) =>
      !candidates.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          canSuppressContainedCandidate(candidate, other) &&
          area(other) > area(candidate) * 1.5 &&
          other.sources.length >= candidate.sources.length &&
          overlapOfSmaller(candidate, other) >= 0.9,
      ),
  );
}

function canSuppressContainedCandidate(candidate: Candidate, other: Candidate): boolean {
  if (other.kind === candidate.kind) return true;
  return (
    candidate.kind === 'vector' &&
    !hasSourceType(candidate, 'formField') &&
    hasSourceType(other, 'formField') &&
    (!candidate.associatedText || candidate.associatedText.length === 0)
  );
}

function edgeChromeBandForBox(box: BoxLike, pageWidth: number, pageHeight: number): BoxLike | undefined {
  const visible = visiblePageBox(box, pageWidth, pageHeight);
  const edge =
    visible.y <= pageHeight * REPEATED_CHROME_EDGE_RATIO
      ? 'top'
      : visible.y + visible.height >= pageHeight * (1 - REPEATED_CHROME_EDGE_RATIO)
        ? 'bottom'
        : undefined;
  if (!edge) return undefined;
  return edge === 'top'
    ? {
        x: 0,
        y: 0,
        width: pageWidth,
        height: Math.min(pageHeight, visible.y + visible.height + REPEATED_CHROME_BAND_PADDING_PT),
      }
    : {
        x: 0,
        y: Math.max(0, visible.y - REPEATED_CHROME_BAND_PADDING_PT),
        width: pageWidth,
        height: pageHeight - Math.max(0, visible.y - REPEATED_CHROME_BAND_PADDING_PT),
      };
}

function pushMergedChromeBand(bands: BoxLike[], band: BoxLike): void {
  const existingIndex = bands.findIndex((existing) => (band.y === 0 ? existing.y === 0 : existing.y > 0));
  if (existingIndex >= 0) {
    bands[existingIndex] = unionBox(bands[existingIndex], band);
  } else {
    bands.push(band);
  }
}

function repeatedChromeBands(layout: PageLayout | undefined, pageWidth: number, pageHeight: number): BoxLike[] {
  const bands: BoxLike[] = [];
  for (const block of layout?.blocks ?? []) {
    if (!block.repeated || !isFinitePositiveBox(block)) continue;
    const padded = edgeChromeBandForBox(block, pageWidth, pageHeight);
    if (!padded) continue;
    pushMergedChromeBand(bands, padded);
  }
  return bands;
}

function vectorChromeBands(
  vectorBoxes: readonly VectorBox[] | undefined,
  pageWidth: number,
  pageHeight: number,
): BoxLike[] {
  const bands: BoxLike[] = [];
  for (const box of vectorBoxes ?? []) {
    if (!isUsableBox(box) || !isLikelyHorizontalChrome(box, pageWidth, pageHeight)) continue;
    const padded = edgeChromeBandForBox(box, pageWidth, pageHeight);
    if (!padded) continue;
    pushMergedChromeBand(bands, padded);
  }
  return bands;
}

function isSuppressibleRepeatedChromeCandidate(candidate: Candidate): boolean {
  return (
    candidate.kind === 'vector' &&
    hasSourceType(candidate, 'vectorBox') &&
    !hasSourceType(candidate, 'layoutTable') &&
    !hasSourceType(candidate, 'formField') &&
    !hasSourceType(candidate, 'annotation')
  );
}

function suppressRepeatedChromeCandidates(
  candidates: Candidate[],
  layout: PageLayout | undefined,
  vectorBoxes: readonly VectorBox[] | undefined,
  pageWidth: number,
  pageHeight: number,
): Candidate[] {
  const bands = [
    ...repeatedChromeBands(layout, pageWidth, pageHeight),
    ...vectorChromeBands(vectorBoxes, pageWidth, pageHeight),
  ];
  if (bands.length === 0) return candidates;
  return candidates.filter((candidate) => {
    if (!isSuppressibleRepeatedChromeCandidate(candidate)) return true;
    const visible = visiblePageBox(candidate, pageWidth, pageHeight);
    const candidateArea = area(visible);
    if (candidateArea <= 0) return true;
    return !bands.some((band) => overlapArea(visible, band) / candidateArea >= REPEATED_CHROME_CANDIDATE_OVERLAP_RATIO);
  });
}

export function buildVisualRegions(input: BuildVisualRegionsInput): VisualRegion[] {
  if (input.pageWidth <= 0 || input.pageHeight <= 0) return [];
  if (input.visualStatus === 'blank') return [];

  const candidates: Candidate[] = [];
  addRasterCandidates(input, candidates);
  addVectorCandidates(input, candidates);
  addTableCandidates(input.layout, candidates, input.pageWidth, input.pageHeight);
  addFormCandidate(input.formFields, input.pageHeight, candidates);
  addAnnotationCandidates(input.annotations, candidates);

  const totalArea = pageArea(input);
  const formAwareCandidates = suppressFormBackplaneCandidates(candidates, totalArea);
  const blankAwareCandidates = suppressBlankFullPageCandidates(
    formAwareCandidates,
    input.pageWidth,
    input.pageHeight,
    input.visualStatus,
  );
  const backplaneAwareCandidates = suppressLoneFullPageVectorBackplanes(blankAwareCandidates, input);
  const foregroundCandidates = suppressBackgroundLikeCandidates(
    backplaneAwareCandidates,
    input.pageWidth,
    input.pageHeight,
  );
  const rasterPanelAwareCandidates = suppressBroadVectorBackplaneCandidates(foregroundCandidates, totalArea);
  const deduped = suppressBackgroundLikeCandidates(
    dedupeCandidates(rasterPanelAwareCandidates),
    input.pageWidth,
    input.pageHeight,
  );
  const chromeAwareCandidates = suppressRepeatedChromeCandidates(
    suppressContainedCandidates(deduped),
    input.layout,
    input.vectorBoxes,
    input.pageWidth,
    input.pageHeight,
  );
  const withCaptions = attachCaptionText(chromeAwareCandidates, input.layout);
  const withTableLeadInLabels = attachTableLeadInLabels(withCaptions, input.layout);
  const withPlainImageLabels = attachPlainImageLabels(withTableLeadInLabels, input.layout);
  const withInRegionPlainLabels = attachInRegionPlainLabels(withPlainImageLabels, input.layout, totalArea);
  const withHeadingLabels = attachHeadingLabels(withInRegionPlainLabels, input.layout, totalArea);
  const contextDeduped = dedupeContextualDuplicates(dedupeEquivalentCandidates(withHeadingLabels));
  return suppressContainedCandidates(contextDeduped)
    .filter((candidate) => isUsableFinalCandidate(candidate, input.pageWidth, input.pageHeight))
    .sort((a, b) => visualScore(b, totalArea) - visualScore(a, totalArea))
    .slice(0, MAX_REGIONS)
    .map((candidate) => finalizeCandidate(candidate, input.pageWidth, input.pageHeight))
    .sort((a, b) => (Math.abs(a.y - b.y) > 2 ? a.y - b.y : a.x - b.x));
}

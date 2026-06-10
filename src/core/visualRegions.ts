import type {
  FormField,
  ImageBox,
  PageLayout,
  VectorBox,
  VisualRegion,
  VisualRegionAssociatedText,
  VisualRegionKind,
  VisualRegionSource,
} from '../types/index.js';

interface BoxLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Candidate extends BoxLike {
  kind: VisualRegionKind;
  priority: number;
  reason: string;
  sources: VisualRegionSource[];
  associatedText?: VisualRegionAssociatedText[];
}

export interface BuildVisualRegionsInput {
  pageWidth: number;
  pageHeight: number;
  imageBoxes: readonly ImageBox[];
  vectorBoxes?: readonly VectorBox[];
  layout?: PageLayout;
  formFields?: readonly FormField[];
  visualStatus?: 'ok' | 'sparse' | 'blank';
}

const REGION_PADDING_PT = 8;
const CLUSTER_GAP_PT = 10;
const MAX_REGIONS = 12;
const MAX_SOURCE_REFS = 16;
const MIN_REGION_DIMENSION_PT = 18;
const MIN_IMAGE_AREA_RATIO = 0.015;
const MIN_FOREGROUND_RASTER_AREA_RATIO = 0.015;
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
const FORM_CLUSTER_GAP_PT = 18;
const FORM_LARGE_CLUSTER_MIN_FIELDS = 16;
const FORM_LARGE_CLUSTER_SPLIT_GAP_PT = 13;
const FORM_LARGE_CLUSTER_HEIGHT_RATIO = 0.35;
const FORM_BACKPLANE_AREA_RATIO = 0.3;
const FORM_BACKPLANE_MIN_FORM_OVERLAPS = 2;
const BACKGROUND_BOX_AREA_RATIO = 0.9;
const BACKGROUND_BOX_SPAN_RATIO = 0.95;
const PAGE_EDGE_CHROME_SPAN_RATIO = 0.8;
const PAGE_EDGE_CHROME_THICKNESS_RATIO = 0.16;
const CAPTION_MAX_GAP_PT = 54;
const CAPTION_MIN_HORIZONTAL_OVERLAP_RATIO = 0.2;
const HEADING_LABEL_MAX_GAP_PT = 96;
const HEADING_LABEL_MIN_REGION_AREA_RATIO = 0.08;
const HEADING_LABEL_MAX_CHARS = 220;
const EQUIVALENT_CANDIDATE_OVERLAP_RATIO = 0.98;
const EQUIVALENT_CANDIDATE_AREA_RATIO = 0.98;
const MAX_ASSOCIATED_TEXT = 3;
const CAPTION_NUMBER_PATTERN =
  '[\\p{L}\\p{N}０-９一二三四五六七八九十ivxlcdm]+(?:[.-][\\p{L}\\p{N}０-９一二三四五六七八九十ivxlcdm]+)*\\.?';
const CAPTION_PATTERN = new RegExp(
  `^\\s*(?:fig(?:ure)?\\.?|table|plate|図表|図|表)\\s*(${CAPTION_NUMBER_PATTERN})(?=\\s|[:：．、-]|$)`,
  'iu',
);
const CAPTION_NUMBERISH_PATTERN = /[0-9０-９一二三四五六七八九十ivxlcdm]/iu;
const GLOBAL_CAPTION_PATTERN = /^\s*plate\s+/iu;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function area(box: BoxLike): number {
  return Math.max(0, box.width) * Math.max(0, box.height);
}

function pageArea(input: { pageWidth: number; pageHeight: number }): number {
  return Math.max(0, input.pageWidth) * Math.max(0, input.pageHeight);
}

function areaRatio(box: BoxLike, totalArea: number): number {
  return totalArea > 0 ? area(box) / totalArea : 0;
}

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

function isFinitePositiveBox(box: BoxLike): boolean {
  return (
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height) &&
    box.width > 0 &&
    box.height > 0
  );
}

function unionBox(a: BoxLike, b: BoxLike): BoxLike {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function padAndClamp(box: BoxLike, pageWidth: number, pageHeight: number): BoxLike {
  const left = Math.max(0, box.x - REGION_PADDING_PT);
  const top = Math.max(0, box.y - REGION_PADDING_PT);
  const right = Math.min(pageWidth, box.x + box.width + REGION_PADDING_PT);
  const bottom = Math.min(pageHeight, box.y + box.height + REGION_PADDING_PT);
  return {
    x: round2(left),
    y: round2(top),
    width: round2(Math.max(0, right - left)),
    height: round2(Math.max(0, bottom - top)),
  };
}

function expand(box: BoxLike, amount: number): BoxLike {
  return {
    x: box.x - amount,
    y: box.y - amount,
    width: box.width + amount * 2,
    height: box.height + amount * 2,
  };
}

function overlapArea(a: BoxLike, b: BoxLike): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function touches(a: BoxLike, b: BoxLike, gap: number): boolean {
  return overlapArea(expand(a, gap), b) > 0;
}

function overlapOfSmaller(a: BoxLike, b: BoxLike): number {
  const smaller = Math.min(area(a), area(b));
  return smaller > 0 ? overlapArea(a, b) / smaller : 0;
}

function areaSimilarity(a: BoxLike, b: BoxLike): number {
  const smaller = Math.min(area(a), area(b));
  const larger = Math.max(area(a), area(b));
  return larger > 0 ? smaller / larger : 0;
}

function visiblePageBox(box: BoxLike, pageWidth: number, pageHeight: number): BoxLike {
  const left = Math.max(0, box.x);
  const top = Math.max(0, box.y);
  const right = Math.min(pageWidth, box.x + box.width);
  const bottom = Math.min(pageHeight, box.y + box.height);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
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
    visible.height >= pageHeight * 0.3 &&
    visible.width <= pageWidth * 0.08 &&
    (visible.x <= pageWidth * 0.1 || visible.x + visible.width >= pageWidth * 0.9)
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

function isBackgroundLikeCandidate(box: BoxLike, pageWidth: number, pageHeight: number): boolean {
  return (
    isNearFullPageBox(box, pageWidth, pageHeight) ||
    isLikelySideChrome(box, pageWidth, pageHeight) ||
    isLikelyHorizontalChrome(box, pageWidth, pageHeight)
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
        !isLikelyHorizontalChrome(box, input.pageWidth, input.pageHeight),
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
        !isLikelyHorizontalChrome(box, input.pageWidth, input.pageHeight),
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

function visualScore(candidate: Candidate, totalArea: number): number {
  const ratio = totalArea > 0 ? area(candidate) / totalArea : 0;
  return candidate.priority * 100 + ratio * 20 + Math.min(candidate.sources.length, 50);
}

function finalizeCandidate(candidate: Candidate, pageWidth: number, pageHeight: number): VisualRegion {
  const box = padAndClamp(candidate, pageWidth, pageHeight);
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
  return isUsableBox(padAndClamp(candidate, pageWidth, pageHeight));
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
}

function clusterVectorBoxes(
  vectorBoxes: readonly VectorBox[],
  pageWidth: number,
  pageHeight: number,
  skipBackgroundBoxes: boolean,
): Candidate[] {
  const clusters: Candidate[] = [];
  for (const [index, box] of vectorBoxes.entries()) {
    if (!isUsableBox(box)) continue;
    if (isLikelySideChrome(box, pageWidth, pageHeight)) continue;
    if (isLikelyHorizontalChrome(box, pageWidth, pageHeight)) continue;
    if (skipBackgroundBoxes && isNearFullPageBox(box, pageWidth, pageHeight)) continue;
    const matches: number[] = [];
    for (let i = 0; i < clusters.length; i++) {
      if (touches(clusters[i], box, CLUSTER_GAP_PT)) matches.push(i);
    }
    const next: Candidate = {
      ...box,
      kind: 'vector',
      priority: 2,
      reason: 'cluster of vector drawing operations',
      sources: [{ type: 'vectorBox', index }],
    };
    if (matches.length === 0) {
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
  for (const cluster of clusterVectorBoxes(input.vectorBoxes, input.pageWidth, input.pageHeight, skipBackgroundBoxes)) {
    const ratio = areaRatio(cluster, totalArea);
    if (cluster.sources.length < MIN_VECTOR_CLUSTER_SOURCES && ratio < MIN_VECTOR_CLUSTER_AREA_RATIO) continue;
    candidates.push({
      ...cluster,
      reason: `${cluster.sources.length} nearby vector drawing operations`,
    });
  }
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

function addTableCandidates(layout: PageLayout | undefined, candidates: Candidate[]): void {
  for (const [index, table] of (layout?.tables ?? []).entries()) {
    if (!isUsableBox(table)) continue;
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

function addFormCandidate(
  formFields: readonly FormField[] | undefined,
  pageHeight: number,
  candidates: Candidate[],
): void {
  if (!formFields || formFields.length === 0) return;
  const usableFields = formFields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => isFinitePositiveBox(field));
  if (usableFields.length === 0) return;
  for (const cluster of formFieldClusters(usableFields, pageHeight)) {
    const associatedText = cluster.flatMap(({ field, index }) =>
      field.label
        ? [
            {
              text: field.label.text,
              relation: 'label' as const,
              x: field.label.x,
              y: field.label.y,
              width: field.label.width,
              height: field.label.height,
              fieldIndex: index,
            },
          ]
        : [],
    );
    const boxes = [
      ...cluster.map(({ field }) => field),
      ...associatedText.map((label) => ({
        x: label.x,
        y: label.y,
        width: label.width,
        height: label.height,
      })),
    ];
    const box = boxes.slice(1).reduce<BoxLike>((acc, item) => unionBox(acc, item), boxes[0]);
    candidates.push({
      ...box,
      kind: 'form',
      priority: 3,
      reason: `${cluster.length} interactive form fields in one page region`,
      sources: cluster.map(({ index }) => ({ type: 'formField', index })),
      ...(associatedText.length > 0 && { associatedText }),
    });
  }
}

function formFieldBox(field: FormField): BoxLike {
  return field.label ? unionBox(field, field.label) : field;
}

function formFieldClusters<T extends { field: FormField; index: number }>(
  fields: readonly T[],
  pageHeight: number,
): T[][] {
  const clusters: { box: BoxLike; fields: T[] }[] = [];
  for (const item of fields) {
    const box = formFieldBox(item.field);
    const matches: number[] = [];
    for (let i = 0; i < clusters.length; i++) {
      if (touches(clusters[i].box, box, FORM_CLUSTER_GAP_PT)) matches.push(i);
    }
    if (matches.length === 0) {
      clusters.push({ box, fields: [item] });
      continue;
    }

    const first = matches[0];
    clusters[first] = {
      box: unionBox(clusters[first].box, box),
      fields: [...clusters[first].fields, item],
    };
    for (let i = matches.length - 1; i >= 1; i--) {
      clusters[first] = {
        box: unionBox(clusters[first].box, clusters[matches[i]].box),
        fields: [...clusters[first].fields, ...clusters[matches[i]].fields],
      };
      clusters.splice(matches[i], 1);
    }
  }
  return clusters.flatMap((cluster) => splitLargeFormCluster(cluster.fields, pageHeight));
}

function splitLargeFormCluster<T extends { field: FormField; index: number }>(
  fields: readonly T[],
  pageHeight: number,
): T[][] {
  const sorted = [...fields].sort((a, b) => a.field.y - b.field.y || a.field.x - b.field.x);
  if (sorted.length === 0) return [];
  const box = sorted.slice(1).reduce<BoxLike>((acc, item) => unionBox(acc, item.field), sorted[0].field);
  if (sorted.length < FORM_LARGE_CLUSTER_MIN_FIELDS && box.height < pageHeight * FORM_LARGE_CLUSTER_HEIGHT_RATIO) {
    return [sorted];
  }

  const groups: T[][] = [];
  let current: T[] = [];
  let previousBottom = Number.NEGATIVE_INFINITY;
  for (const item of sorted) {
    const gap = item.field.y - previousBottom;
    if (current.length > 0 && gap >= FORM_LARGE_CLUSTER_SPLIT_GAP_PT) {
      groups.push(current);
      current = [];
    }
    current.push(item);
    previousBottom = Math.max(previousBottom, item.field.y + item.field.height);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function suppressFormBackplaneCandidates(candidates: Candidate[], totalArea: number): Candidate[] {
  const formCandidates = candidates.filter((candidate) => hasSourceType(candidate, 'formField'));
  if (formCandidates.length < FORM_BACKPLANE_MIN_FORM_OVERLAPS) return candidates;

  return candidates.filter((candidate) => {
    if (hasSourceType(candidate, 'formField')) return true;
    if (candidate.kind !== 'vector') return true;
    if (areaRatio(candidate, totalArea) < FORM_BACKPLANE_AREA_RATIO) return true;
    const overlappingForms = formCandidates.filter((form) => overlapOfSmaller(form, candidate) >= 0.75).length;
    return overlappingForms < FORM_BACKPLANE_MIN_FORM_OVERLAPS;
  });
}

function associatedTextKey(text: VisualRegionAssociatedText): string {
  return `${text.relation}:${text.x}:${text.y}:${text.width}:${text.height}:${text.text}`;
}

function mergeAssociatedText(items: readonly VisualRegionAssociatedText[]): VisualRegionAssociatedText[] {
  const seen = new Set<string>();
  const merged: VisualRegionAssociatedText[] = [];
  for (const item of items) {
    const key = associatedTextKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged.sort((a, b) => a.y - b.y || a.x - b.x);
}

function normalizeAssociatedText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isCaptionText(text: string): boolean {
  const match = CAPTION_PATTERN.exec(text);
  return match !== null && CAPTION_NUMBERISH_PATTERN.test(match[1] ?? '');
}

function isGlobalCaptionText(text: string): boolean {
  return GLOBAL_CAPTION_PATTERN.test(text) && isCaptionText(text);
}

function horizontalOverlapRatio(a: BoxLike, b: BoxLike): number {
  const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  return Math.max(0, overlap) / Math.max(1, Math.min(a.width, b.width));
}

function captionScore(candidate: Candidate, textBox: BoxLike): number | undefined {
  const captionBottom = textBox.y + textBox.height;
  const regionBottom = candidate.y + candidate.height;
  const belowGap = textBox.y - regionBottom;
  const aboveGap = candidate.y - captionBottom;
  const overlapsVertically = overlapArea(candidate, textBox) > 0;
  const gap = overlapsVertically ? 0 : belowGap >= 0 ? belowGap : aboveGap >= 0 ? aboveGap : Number.POSITIVE_INFINITY;
  if (gap > CAPTION_MAX_GAP_PT) return undefined;

  const overlap = horizontalOverlapRatio(candidate, textBox);
  if (overlap < CAPTION_MIN_HORIZONTAL_OVERLAP_RATIO) return undefined;
  const belowBonus = belowGap >= -4 ? 0 : 12;
  return gap + (1 - overlap) * 30 + belowBonus;
}

function captionTextsFromBlock(
  block: NonNullable<PageLayout['blocks']>[number],
  blockIndex: number,
): VisualRegionAssociatedText[] {
  const lineCaptions = block.lines
    .map((line) => ({ line, text: normalizeAssociatedText(line.text) }))
    .filter(({ text }) => isCaptionText(text))
    .map(({ line, text }) => ({
      text,
      relation: 'caption' as const,
      x: line.x,
      y: line.y,
      width: line.width,
      height: line.height,
      blockIndex,
    }));
  if (lineCaptions.length > 0) return lineCaptions;

  const text = normalizeAssociatedText(block.text);
  if (!isCaptionText(text)) return [];
  return [
    {
      text,
      relation: 'caption' as const,
      x: block.x,
      y: block.y,
      width: block.width,
      height: block.height,
      blockIndex,
    },
  ];
}

function attachCaptionText(candidates: Candidate[], layout: PageLayout | undefined): Candidate[] {
  const blocks = layout?.blocks ?? [];
  if (blocks.length === 0) return candidates;
  const captionItems = blocks.flatMap((block, index) =>
    block.repeated
      ? []
      : captionTextsFromBlock(block, index).map((associatedText) => ({
          text: associatedText,
          global: isGlobalCaptionText(associatedText.text),
        })),
  );
  const globalCaptions = captionItems.filter((item) => item.global).slice(0, MAX_ASSOCIATED_TEXT);
  return candidates.map((candidate) => {
    const captions = captionItems
      .map((item) => ({
        text: item.text,
        score: captionScore(candidate, item.text),
      }))
      .filter((item): item is { text: VisualRegionAssociatedText; score: number } => item.score !== undefined)
      .sort((a, b) => a.score - b.score)
      .slice(0, MAX_ASSOCIATED_TEXT);
    if (captions.length === 0) {
      if (globalCaptions.length === 0) return candidate;
      const associatedText = mergeAssociatedText([
        ...(candidate.associatedText ?? []),
        ...globalCaptions.map((caption) => caption.text),
      ]);
      return { ...candidate, associatedText };
    }

    const associatedText = mergeAssociatedText([
      ...(candidate.associatedText ?? []),
      ...captions.map((caption) => caption.text),
    ]);
    const box = captions.reduce<BoxLike>((acc, caption) => unionBox(acc, caption.text), candidate);
    return { ...candidate, ...box, associatedText };
  });
}

function headingLabelScore(
  candidate: Candidate,
  block: NonNullable<PageLayout['blocks']>[number],
  totalArea: number,
): number | undefined {
  if (candidate.associatedText && candidate.associatedText.length > 0) return undefined;
  if (areaRatio(candidate, totalArea) < HEADING_LABEL_MIN_REGION_AREA_RATIO) return undefined;
  if (block.role !== 'heading' || block.repeated) return undefined;
  const text = normalizeAssociatedText(block.text);
  if (text.length === 0 || text.length > HEADING_LABEL_MAX_CHARS) return undefined;
  const blockBottom = block.y + block.height;
  const gap = candidate.y - blockBottom;
  if (gap < -4 || gap > HEADING_LABEL_MAX_GAP_PT) return undefined;
  const overlap = horizontalOverlapRatio(candidate, block);
  if (overlap < CAPTION_MIN_HORIZONTAL_OVERLAP_RATIO) return undefined;
  return gap + (1 - overlap) * 24;
}

function attachHeadingLabels(candidates: Candidate[], layout: PageLayout | undefined, totalArea: number): Candidate[] {
  const blocks = layout?.blocks ?? [];
  if (blocks.length === 0) return candidates;
  return candidates.map((candidate) => {
    const labels = blocks
      .map((block, blockIndex) => ({
        block,
        blockIndex,
        score: headingLabelScore(candidate, block, totalArea),
      }))
      .filter(
        (item): item is { block: NonNullable<PageLayout['blocks']>[number]; blockIndex: number; score: number } =>
          item.score !== undefined,
      )
      .sort((a, b) => a.score - b.score)
      .slice(0, MAX_ASSOCIATED_TEXT)
      .map(({ block, blockIndex }) => ({
        text: normalizeAssociatedText(block.text),
        relation: 'label' as const,
        x: block.x,
        y: block.y,
        width: block.width,
        height: block.height,
        blockIndex,
      }));
    if (labels.length === 0) return candidate;

    const associatedText = mergeAssociatedText([...(candidate.associatedText ?? []), ...labels]);
    const box = labels.reduce<BoxLike>((acc, label) => unionBox(acc, label), candidate);
    return { ...candidate, ...box, associatedText };
  });
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

function suppressBackgroundLikeCandidates(candidates: Candidate[], pageWidth: number, pageHeight: number): Candidate[] {
  const hasForegroundRegion = candidates.some(
    (candidate) => !isBackgroundLikeCandidate(candidate, pageWidth, pageHeight),
  );
  if (!hasForegroundRegion) return candidates;
  return candidates.filter((candidate) => !isBackgroundLikeCandidate(candidate, pageWidth, pageHeight));
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

function suppressContainedCandidates(candidates: Candidate[]): Candidate[] {
  return candidates.filter(
    (candidate, index) =>
      !candidates.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          other.kind === candidate.kind &&
          area(other) > area(candidate) * 1.5 &&
          other.sources.length >= candidate.sources.length &&
          overlapOfSmaller(candidate, other) >= 0.9,
      ),
  );
}

export function buildVisualRegions(input: BuildVisualRegionsInput): VisualRegion[] {
  if (input.pageWidth <= 0 || input.pageHeight <= 0) return [];

  const candidates: Candidate[] = [];
  addRasterCandidates(input, candidates);
  addVectorCandidates(input, candidates);
  addTableCandidates(input.layout, candidates);
  addFormCandidate(input.formFields, input.pageHeight, candidates);

  const totalArea = pageArea(input);
  const formAwareCandidates = suppressFormBackplaneCandidates(candidates, totalArea);
  const blankAwareCandidates = suppressBlankFullPageCandidates(
    formAwareCandidates,
    input.pageWidth,
    input.pageHeight,
    input.visualStatus,
  );
  const foregroundCandidates = suppressBackgroundLikeCandidates(
    blankAwareCandidates,
    input.pageWidth,
    input.pageHeight,
  );
  const deduped = suppressBackgroundLikeCandidates(
    dedupeCandidates(foregroundCandidates),
    input.pageWidth,
    input.pageHeight,
  );
  const withCaptions = attachCaptionText(suppressContainedCandidates(deduped), input.layout);
  const withHeadingLabels = attachHeadingLabels(withCaptions, input.layout, totalArea);
  const contextDeduped = dedupeEquivalentCandidates(withHeadingLabels);
  return suppressContainedCandidates(contextDeduped)
    .filter((candidate) => isUsableFinalCandidate(candidate, input.pageWidth, input.pageHeight))
    .sort((a, b) => visualScore(b, totalArea) - visualScore(a, totalArea))
    .slice(0, MAX_REGIONS)
    .map((candidate) => finalizeCandidate(candidate, input.pageWidth, input.pageHeight))
    .sort((a, b) => (Math.abs(a.y - b.y) > 2 ? a.y - b.y : a.x - b.x));
}

import type { VectorBox } from '../../types/index.js';
import { mergeCandidates } from './candidateMerge.js';
import { areaRatio, pageArea, touches, unionBox, visiblePageBox } from './geometry.js';
import {
  hasNonBackgroundBox,
  isLikelyHorizontalChrome,
  isLikelySideChrome,
  isLikelyUnpositionedFormWidgetVector,
  isLikelyVectorBackplane,
  isNearFullPageBox,
  isUsableBox,
  isUsableVectorConnectorBox,
  isUsefulDenseVectorBox,
  isUsefulMicroVectorBox,
} from './predicates.js';
import { addRuledTableVectorCandidates } from './ruledTables.js';
import type { BoxLike, BuildVisualRegionsInput, Candidate } from './types.js';

const CLUSTER_GAP_PT = 10;
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
const MIN_DENSE_MICRO_VECTOR_FIELD_BOXES = 500;
const MIN_DENSE_MICRO_VECTOR_FIELD_AREA_RATIO = 0.25;
const MIN_DENSE_MICRO_VECTOR_FIELD_SPAN_RATIO = 0.45;

function denseVectorItems(input: BuildVisualRegionsInput): { box: VectorBox; index: number }[] {
  return (input.vectorBoxes ?? [])
    .map((box, index) => ({ box, index }))
    .filter(
      ({ box }) =>
        isUsefulDenseVectorBox(box, MIN_DENSE_VECTOR_LINE_LENGTH_PT) &&
        !isLikelyVectorBackplane(box, input.pageWidth, input.pageHeight) &&
        !isLikelyUnpositionedFormWidgetVector(box, input),
    );
}

function denseMicroVectorItems(input: BuildVisualRegionsInput): { box: VectorBox; index: number }[] {
  return (input.vectorBoxes ?? [])
    .map((box, index) => ({ box, index }))
    .filter(
      ({ box }) =>
        isUsefulMicroVectorBox(box) &&
        !isLikelyVectorBackplane(box, input.pageWidth, input.pageHeight) &&
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

export function hasDenseVectorStructure(input: BuildVisualRegionsInput): boolean {
  const useful = denseVectorItems(input);
  if (useful.length < MIN_DENSE_VECTOR_BOXES) return false;

  return denseVectorClusters(useful).some(
    (cluster) =>
      cluster.items.length >= MIN_DENSE_VECTOR_CLUSTER_BOXES &&
      areaRatio(cluster.box, pageArea(input)) >= MIN_DENSE_VECTOR_UNION_AREA_RATIO,
  );
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

export function addVectorCandidates(input: BuildVisualRegionsInput, candidates: Candidate[]): void {
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
  addDenseMicroVectorFieldCandidate(input, candidates);
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

function addDenseMicroVectorFieldCandidate(input: BuildVisualRegionsInput, candidates: Candidate[]): void {
  if ((input.vectorBoxes ?? []).length < MIN_DENSE_MICRO_VECTOR_FIELD_BOXES) return;
  const useful = denseMicroVectorItems(input);
  if (useful.length < MIN_DENSE_MICRO_VECTOR_FIELD_BOXES) return;

  const field = visiblePageBox(
    useful.reduce((box, item) => unionBox(box, item.box), useful[0].box),
    input.pageWidth,
    input.pageHeight,
  );
  const totalArea = pageArea(input);
  if (areaRatio(field, totalArea) < MIN_DENSE_MICRO_VECTOR_FIELD_AREA_RATIO) return;
  if (
    field.width < input.pageWidth * MIN_DENSE_MICRO_VECTOR_FIELD_SPAN_RATIO ||
    field.height < input.pageHeight * MIN_DENSE_MICRO_VECTOR_FIELD_SPAN_RATIO
  ) {
    return;
  }

  candidates.push({
    ...field,
    kind: 'vector',
    priority: 2,
    reason: `${useful.length} dense small vector markers spread across broad map/diagram field`,
    sources: useful.map(({ index }) => ({ type: 'vectorBox', index })),
  });
}

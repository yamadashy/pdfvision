import { associatedTextKey } from './associatedText.js';
import { hasSourceType, mergeCandidateMetadataInto, mergeCandidates } from './candidateMerge.js';
import {
  area,
  areaRatio,
  areaSimilarity,
  horizontalOverlapRatio,
  overlapArea,
  overlapOfSmaller,
  unionBox,
} from './geometry.js';
import { isBackgroundLikeCandidate, isNearFullPageBox } from './predicates.js';
import type { BuildVisualRegionsInput, Candidate } from './types.js';

const FORM_BACKPLANE_AREA_RATIO = 0.3;
const FORM_BACKPLANE_SINGLE_FORM_AREA_RATIO = 0.5;
const FORM_BACKPLANE_MIN_FORM_OVERLAPS = 2;
const VECTOR_BACKPLANE_MIN_RASTER_OVERLAPS = 2;
const VECTOR_BACKPLANE_MIN_AREA_RATIO = 0.25;
const DENSE_VECTOR_FIELD_MIN_SOURCES = 500;
const EQUIVALENT_CANDIDATE_OVERLAP_RATIO = 0.98;
const EQUIVALENT_CANDIDATE_AREA_RATIO = 0.98;
const CONTEXTUAL_DUPLICATE_OVERLAP_RATIO = 0.85;
const CONTEXTUAL_DUPLICATE_AREA_RATIO = 0.85;
const CONTEXTUAL_DUPLICATE_CONTAINED_OVERLAP_RATIO = 0.95;
const TABLE_COLUMN_STRIP_COVERAGE_RATIO = 0.85;
const TABLE_COLUMN_STRIP_MAX_WIDTH_RATIO = 0.5;
const TABLE_COLUMN_STRIP_MIN_HEIGHT_RATIO = 0.7;
const RASTER_TEXT_STRIP_VECTOR_MERGE_GAP_PT = 12;
const RASTER_TEXT_STRIP_VECTOR_MIN_OVERLAP_RATIO = 0.5;
const RASTER_TEXT_STRIP_VECTOR_MIN_SOURCES = 4;
const RASTER_TEXT_STRIP_VECTOR_MIN_AREA_RATIO = 0.02;

export function suppressFormBackplaneCandidates(candidates: Candidate[], totalArea: number): Candidate[] {
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

export function suppressBroadVectorBackplaneCandidates(candidates: Candidate[], totalArea: number): Candidate[] {
  const rasterCandidates = candidates.filter(isStandaloneRasterCandidate);
  if (rasterCandidates.length < VECTOR_BACKPLANE_MIN_RASTER_OVERLAPS) return candidates;

  return candidates.filter((candidate) => {
    if (!isStandaloneVectorCandidate(candidate)) return true;
    if (isDenseVectorFieldCandidate(candidate)) return true;
    if (areaRatio(candidate, totalArea) < VECTOR_BACKPLANE_MIN_AREA_RATIO) return true;
    const overlappingRasters = rasterCandidates.filter(
      (raster) => overlapOfSmaller(raster, candidate) >= CONTEXTUAL_DUPLICATE_CONTAINED_OVERLAP_RATIO,
    );
    return overlappingRasters.length < VECTOR_BACKPLANE_MIN_RASTER_OVERLAPS;
  });
}

export function suppressTableColumnVectorStrips(candidates: Candidate[]): Candidate[] {
  const tableCandidates = candidates.filter((candidate) => hasSourceType(candidate, 'layoutTable'));
  if (tableCandidates.length === 0) return candidates;

  return candidates.filter((candidate) => {
    if (!isStandaloneVectorCandidate(candidate)) return true;
    if (candidate.associatedText && candidate.associatedText.length > 0) return true;

    const overlappingTables = tableCandidates.filter((table) => overlapArea(candidate, table) > 0);
    if (overlappingTables.length === 0) return true;

    const coveredArea = overlappingTables.reduce((sum, table) => sum + overlapArea(candidate, table), 0);
    if (coveredArea / Math.max(1, area(candidate)) < TABLE_COLUMN_STRIP_COVERAGE_RATIO) return true;

    const [firstTable, ...remainingTables] = overlappingTables;
    let tableBox = {
      x: firstTable.x,
      y: firstTable.y,
      width: firstTable.width,
      height: firstTable.height,
    };
    for (const table of remainingTables) {
      tableBox = unionBox(tableBox, table);
    }
    return !(
      candidate.width <= tableBox.width * TABLE_COLUMN_STRIP_MAX_WIDTH_RATIO &&
      candidate.height >= tableBox.height * TABLE_COLUMN_STRIP_MIN_HEIGHT_RATIO
    );
  });
}

export function mergeRasterTextStripsIntoNearbyVectorCharts(candidates: Candidate[], totalArea: number): Candidate[] {
  const consumed = new Set<number>();
  const replacements = new Map<number, Candidate>();

  for (const [index, candidate] of candidates.entries()) {
    if (!isRasterTextStripCandidate(candidate)) continue;
    const targetIndex = findNearbyVectorChartIndex(candidate, candidates, totalArea);
    if (targetIndex === -1) continue;

    const target = replacements.get(targetIndex) ?? candidates[targetIndex];
    replacements.set(targetIndex, mergeCandidates(target, candidate));
    consumed.add(index);
  }

  return candidates.flatMap((candidate, index) => {
    if (consumed.has(index)) return [];
    return [replacements.get(index) ?? candidate];
  });
}

function isStandaloneRasterCandidate(candidate: Candidate): boolean {
  return candidate.kind === 'raster' && candidate.sources.every((source) => source.type === 'imageBox');
}

function isStandaloneVectorCandidate(candidate: Candidate): boolean {
  return candidate.kind === 'vector' && candidate.sources.every((source) => source.type === 'vectorBox');
}

function isRasterTextStripCandidate(candidate: Candidate): boolean {
  return isStandaloneRasterCandidate(candidate) && candidate.reason.includes('raster text');
}

function findNearbyVectorChartIndex(raster: Candidate, candidates: readonly Candidate[], totalArea: number): number {
  let bestIndex = -1;
  let bestGap = Number.POSITIVE_INFINITY;

  for (const [index, candidate] of candidates.entries()) {
    if (!isVectorChartMergeTarget(candidate, totalArea)) continue;
    if (horizontalOverlapRatio(raster, candidate) < RASTER_TEXT_STRIP_VECTOR_MIN_OVERLAP_RATIO) continue;
    const gap = verticalGap(raster, candidate);
    if (gap > RASTER_TEXT_STRIP_VECTOR_MERGE_GAP_PT) continue;
    if (gap < bestGap) {
      bestGap = gap;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function isVectorChartMergeTarget(candidate: Candidate, totalArea: number): boolean {
  if (candidate.kind !== 'vector') return false;
  if (!hasSourceType(candidate, 'vectorBox')) return false;
  if (hasSourceType(candidate, 'layoutTable') || hasSourceType(candidate, 'formField')) return false;

  const vectorSources = candidate.sources.filter((source) => source.type === 'vectorBox').length;
  return (
    vectorSources >= RASTER_TEXT_STRIP_VECTOR_MIN_SOURCES ||
    areaRatio(candidate, totalArea) >= RASTER_TEXT_STRIP_VECTOR_MIN_AREA_RATIO
  );
}

function verticalGap(a: Candidate, b: Candidate): number {
  return Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height), 0);
}

function isDenseVectorFieldCandidate(candidate: Candidate): boolean {
  return (
    candidate.sources.length >= DENSE_VECTOR_FIELD_MIN_SOURCES &&
    candidate.reason.includes('dense small vector markers spread across broad')
  );
}

export function dedupeCandidates(candidates: Candidate[]): Candidate[] {
  const deduped: Candidate[] = [];
  for (const candidate of candidates) {
    const index = deduped.findIndex((existing) => overlapOfSmaller(existing, candidate) >= 0.75);
    if (index === -1) deduped.push(candidate);
    else deduped[index] = mergeCandidates(deduped[index], candidate);
  }
  return deduped;
}

export function dedupeEquivalentCandidates(candidates: Candidate[]): Candidate[] {
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

export function dedupeContextualDuplicates(candidates: Candidate[]): Candidate[] {
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

export function suppressBackgroundLikeCandidates(
  candidates: Candidate[],
  pageWidth: number,
  pageHeight: number,
): Candidate[] {
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

export function suppressBlankFullPageCandidates(
  candidates: Candidate[],
  pageWidth: number,
  pageHeight: number,
  visualStatus: BuildVisualRegionsInput['visualStatus'],
): Candidate[] {
  if (visualStatus !== 'blank') return candidates;
  return candidates.filter((candidate) => !isNearFullPageBox(candidate, pageWidth, pageHeight));
}

export function suppressLoneFullPageVectorBackplanes(
  candidates: Candidate[],
  input: BuildVisualRegionsInput,
): Candidate[] {
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

export function suppressContainedCandidates(candidates: Candidate[]): Candidate[] {
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
  if (
    candidate.kind === 'vector' &&
    other.kind === 'mixed' &&
    hasSourceType(candidate, 'vectorBox') &&
    hasSourceType(other, 'vectorBox') &&
    hasSourceType(other, 'imageBox') &&
    (!candidate.associatedText || candidate.associatedText.length === 0)
  ) {
    return true;
  }
  return (
    candidate.kind === 'vector' &&
    !hasSourceType(candidate, 'formField') &&
    hasSourceType(other, 'formField') &&
    (!candidate.associatedText || candidate.associatedText.length === 0)
  );
}

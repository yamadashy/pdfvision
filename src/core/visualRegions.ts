import type { VisualRegion } from '../types/index.js';
import { addAnnotationCandidates } from './visualRegions/annotationCandidates.js';
import { MAX_ASSOCIATED_TEXT, mergeAssociatedText } from './visualRegions/associatedText.js';
import { mergeSources } from './visualRegions/candidateMerge.js';
import { attachCaptionText } from './visualRegions/captions.js';
import { suppressRepeatedChromeCandidates } from './visualRegions/chromeSuppression.js';
import { addFormCandidate } from './visualRegions/formCandidates.js';
import { area, padAndClamp, pageArea, round3 } from './visualRegions/geometry.js';
import {
  attachHeadingLabels,
  attachInRegionPlainLabels,
  attachPlainImageLabels,
  attachTableLeadInLabels,
} from './visualRegions/labels.js';
import { isUsableBox } from './visualRegions/predicates.js';
import { addRasterCandidates } from './visualRegions/rasterCandidates.js';
import {
  dedupeCandidates,
  dedupeContextualDuplicates,
  dedupeEquivalentCandidates,
  suppressBackgroundLikeCandidates,
  suppressBlankFullPageCandidates,
  suppressBroadVectorBackplaneCandidates,
  suppressContainedCandidates,
  suppressFormBackplaneCandidates,
  suppressLoneFullPageVectorBackplanes,
} from './visualRegions/suppression.js';
import { addTableCandidates } from './visualRegions/tableCandidates.js';
import type { BuildVisualRegionsInput, Candidate } from './visualRegions/types.js';
import { addVectorCandidates } from './visualRegions/vectorCandidates.js';

export type { BuildVisualRegionsInput } from './visualRegions/types.js';

const REGION_PADDING_PT = 8;
const MAX_REGIONS = 12;
const MAX_SOURCE_REFS = 16;

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

import type { VisualRegion } from '../../types/index.js';
import { addAnnotationCandidates } from './annotationCandidates.js';
import { MAX_ASSOCIATED_TEXT, mergeAssociatedText } from './associatedText.js';
import { mergeSources } from './candidateMerge.js';
import { attachCaptionText } from './captions.js';
import { suppressRepeatedChromeCandidates } from './chromeSuppression.js';
import { addFormCandidate } from './formCandidates.js';
import { area, padAndClamp, pageArea, round3 } from './geometry.js';
import {
  attachHeadingLabels,
  attachInRegionPlainLabels,
  attachPanelTitleLabels,
  attachPlainImageLabels,
  attachTableLeadInLabels,
} from './labels.js';
import { addMixedDiagramCandidate } from './mixedDiagrams.js';
import { addLabeledPageDiagramCandidate } from './pageDiagrams.js';
import { isUsableBox } from './predicates.js';
import { addRasterCandidates } from './rasterCandidates.js';
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
} from './suppression.js';
import { addTableCandidates } from './tableCandidates.js';
import type { BuildVisualRegionsInput, Candidate } from './types.js';
import { addVectorCandidates } from './vectorCandidates.js';

export type { BuildVisualRegionsInput } from './types.js';

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
  addMixedDiagramCandidate(input, candidates);
  addLabeledPageDiagramCandidate(input, candidates);
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
  const withPanelTitleLabels = attachPanelTitleLabels(withHeadingLabels, input.layout, totalArea);
  const contextDeduped = dedupeContextualDuplicates(dedupeEquivalentCandidates(withPanelTitleLabels));
  return suppressContainedCandidates(contextDeduped)
    .filter((candidate) => isUsableFinalCandidate(candidate, input.pageWidth, input.pageHeight))
    .sort((a, b) => visualScore(b, totalArea) - visualScore(a, totalArea))
    .slice(0, MAX_REGIONS)
    .map((candidate) => finalizeCandidate(candidate, input.pageWidth, input.pageHeight))
    .sort((a, b) => (Math.abs(a.y - b.y) > 2 ? a.y - b.y : a.x - b.x));
}

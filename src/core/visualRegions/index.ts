import type { VisualRegion } from '../../types/index.js';
import { addAnnotationCandidates } from './annotationCandidates.js';
import { MAX_ASSOCIATED_TEXT, mergeAssociatedText } from './associatedText.js';
import { mergeSources } from './candidateMerge.js';
import { addCaptionedFigureCandidates } from './captionedFigures.js';
import { attachCaptionText } from './captions.js';
import { suppressRepeatedChromeCandidates } from './chromeSuppression.js';
import { addFormCandidate } from './formCandidates.js';
import { area, padAndClamp, pageArea, round2, round3, verticalOverlapRatio } from './geometry.js';
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
import { attachSourceLines } from './sourceLines.js';
import {
  dedupeCandidates,
  dedupeContextualDuplicates,
  dedupeEquivalentCandidates,
  mergeRasterTextStripsIntoNearbyVectorCharts,
  suppressBackgroundLikeCandidates,
  suppressBlankFullPageCandidates,
  suppressBroadVectorBackplaneCandidates,
  suppressContainedCandidates,
  suppressFormBackplaneCandidates,
  suppressLoneFullPageVectorBackplanes,
  suppressLowContentFullPageRasterScans,
  suppressTableColumnVectorStrips,
} from './suppression.js';
import { addTableCandidates } from './tableCandidates.js';
import { clampCrossColumnTableCandidatesToCaptionColumn } from './tableColumnClamp.js';
import { mergeTableHeaderCandidatesIntoFollowingTables } from './tableHeaderMerge.js';
import { mergeStackedSameLabelTableCandidates } from './tableLabelMerge.js';
import type { BoxLike, BuildVisualRegionsInput, Candidate } from './types.js';
import { addVectorCandidates } from './vectorCandidates.js';

export type { BuildVisualRegionsInput } from './types.js';

const REGION_PADDING_PT = 8;
const MAX_REGIONS = 12;
const MAX_SOURCE_REFS = 16;
const MAX_FORM_ASSOCIATED_TEXT = 12;

function visualScore(candidate: Candidate, totalArea: number): number {
  const ratio = totalArea > 0 ? area(candidate) / totalArea : 0;
  return candidate.priority * 100 + ratio * 20 + Math.min(candidate.sources.length, 50);
}

function finalizeCandidate(
  candidate: Candidate,
  pageWidth: number,
  pageHeight: number,
  peers: readonly Candidate[] = [],
): VisualRegion {
  const box = padAndClampForAdjacentPeers(candidate, pageWidth, pageHeight, peers);
  const totalArea = pageWidth * pageHeight;
  const sources = mergeSources(candidate.sources);
  const associatedText = mergeAssociatedText(candidate.associatedText ?? []);
  const associatedTextLimit = candidateHasSourceType(candidate, 'formField')
    ? MAX_FORM_ASSOCIATED_TEXT
    : MAX_ASSOCIATED_TEXT;
  return {
    kind: candidate.kind,
    ...box,
    areaRatio: totalArea > 0 ? round3(area(box) / totalArea) : 0,
    sourceCount: sources.length,
    sources: sources.slice(0, MAX_SOURCE_REFS),
    reason: candidate.reason,
    ...(associatedText.length > 0 && { associatedText: associatedText.slice(0, associatedTextLimit) }),
  };
}

function candidateHasSourceType(candidate: Candidate, type: Candidate['sources'][number]['type']): boolean {
  return candidate.sources.some((source) => source.type === type);
}

function padAndClampForAdjacentPeers(
  candidate: Candidate,
  pageWidth: number,
  pageHeight: number,
  peers: readonly Candidate[],
): BoxLike {
  if (!isSingleRasterImageCandidate(candidate)) return padAndClamp(candidate, pageWidth, pageHeight, REGION_PADDING_PT);

  const leftLimit = adjacentBoundary(candidate, peers, 'left');
  const rightLimit = adjacentBoundary(candidate, peers, 'right');
  const padded = padAndClamp(candidate, pageWidth, pageHeight, REGION_PADDING_PT);
  const left = Math.max(padded.x, leftLimit ?? 0);
  const right = Math.min(padded.x + padded.width, rightLimit ?? pageWidth);
  return {
    x: round2(left),
    y: padded.y,
    width: round2(Math.max(0, right - left)),
    height: padded.height,
  };
}

function adjacentBoundary(
  candidate: Candidate,
  peers: readonly Candidate[],
  side: 'left' | 'right',
): number | undefined {
  const candidateCenter = centerX(candidate);
  let boundary: number | undefined;
  for (const peer of peers) {
    if (peer === candidate || !isSingleRasterImageCandidate(peer)) continue;
    if (verticalOverlapRatio(candidate, peer) < 0.35) continue;
    const peerCenter = centerX(peer);
    if (side === 'left' && peerCenter >= candidateCenter) continue;
    if (side === 'right' && peerCenter <= candidateCenter) continue;
    const edgeBoundary =
      side === 'left'
        ? peer.x + peer.width <= candidate.x
          ? (peer.x + peer.width + candidate.x) / 2
          : (peerCenter + candidateCenter) / 2
        : candidate.x + candidate.width <= peer.x
          ? (candidate.x + candidate.width + peer.x) / 2
          : (candidateCenter + peerCenter) / 2;
    boundary =
      side === 'left'
        ? Math.max(boundary ?? edgeBoundary, edgeBoundary)
        : Math.min(boundary ?? edgeBoundary, edgeBoundary);
  }
  return boundary;
}

function isSingleRasterImageCandidate(candidate: Candidate): boolean {
  return candidate.kind === 'raster' && candidate.sources.length === 1 && candidate.sources[0]?.type === 'imageBox';
}

function centerX(box: Candidate): number {
  return box.x + box.width / 2;
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
  const lowContentAwareCandidates = suppressLowContentFullPageRasterScans(blankAwareCandidates, input);
  const backplaneAwareCandidates = suppressLoneFullPageVectorBackplanes(lowContentAwareCandidates, input);
  const foregroundCandidates = suppressBackgroundLikeCandidates(
    backplaneAwareCandidates,
    input.pageWidth,
    input.pageHeight,
  );
  const rasterPanelAwareCandidates = suppressBroadVectorBackplaneCandidates(foregroundCandidates, totalArea);
  const tableColumnAwareCandidates = suppressTableColumnVectorStrips(rasterPanelAwareCandidates);
  const rasterStripAwareCandidates = mergeRasterTextStripsIntoNearbyVectorCharts(tableColumnAwareCandidates, totalArea);
  const deduped = suppressBackgroundLikeCandidates(
    dedupeCandidates(rasterStripAwareCandidates),
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
  const captionedFigureCandidates = addCaptionedFigureCandidates(input, chromeAwareCandidates);
  const withCaptions = attachCaptionText(captionedFigureCandidates, input.layout);
  const withSourceLines = attachSourceLines(withCaptions, input.layout);
  const columnAwareTables = clampCrossColumnTableCandidatesToCaptionColumn(withSourceLines, input.pageWidth);
  const withTableLeadInLabels = attachTableLeadInLabels(columnAwareTables, input.layout);
  const withPlainImageLabels = attachPlainImageLabels(withTableLeadInLabels, input.layout, totalArea);
  const withHeadingLabels = attachHeadingLabels(withPlainImageLabels, input.layout, totalArea);
  const withInRegionPlainLabels = attachInRegionPlainLabels(withHeadingLabels, input.layout, totalArea);
  const withPanelTitleLabels = attachPanelTitleLabels(withInRegionPlainLabels, input.layout, totalArea);
  const tableHeaderMerged = mergeTableHeaderCandidatesIntoFollowingTables(withPanelTitleLabels);
  const stackedTableMerged = mergeStackedSameLabelTableCandidates(tableHeaderMerged);
  const contextDeduped = dedupeContextualDuplicates(dedupeEquivalentCandidates(stackedTableMerged));
  const finalTableColumnAwareCandidates = suppressTableColumnVectorStrips(contextDeduped);
  const selectedCandidates = suppressContainedCandidates(finalTableColumnAwareCandidates)
    .filter((candidate) => isUsableFinalCandidate(candidate, input.pageWidth, input.pageHeight))
    .sort((a, b) => visualScore(b, totalArea) - visualScore(a, totalArea))
    .slice(0, MAX_REGIONS);
  return selectedCandidates
    .map((candidate) => finalizeCandidate(candidate, input.pageWidth, input.pageHeight, selectedCandidates))
    .sort((a, b) => (Math.abs(a.y - b.y) > 2 ? a.y - b.y : a.x - b.x));
}

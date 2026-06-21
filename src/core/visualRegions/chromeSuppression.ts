import type { PageLayout, VectorBox } from '../../types/index.js';
import { hasSourceType } from './candidateMerge.js';
import { area, isFinitePositiveBox, overlapArea, unionBox, visiblePageBox } from './geometry.js';
import { isLikelyHorizontalChrome, isUsableBox } from './predicates.js';
import type { BoxLike, Candidate } from './types.js';

const REPEATED_CHROME_EDGE_RATIO = 0.12;
const REPEATED_CHROME_BAND_PADDING_PT = 18;
const REPEATED_CHROME_CANDIDATE_OVERLAP_RATIO = 0.55;

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

export function suppressRepeatedChromeCandidates(
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

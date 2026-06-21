import type { PageLayout } from '../../../types/index.js';
import { MAX_ASSOCIATED_TEXT, mergeAssociatedText, normalizeAssociatedText } from '../associatedText.js';
import { isCaptionText } from '../captions.js';
import { areaRatio, horizontalOverlapRatio, unionBox } from '../geometry.js';
import type { BoxLike, Candidate } from '../types.js';
import { hasSourceType } from './sources.js';

const PLAIN_IMAGE_LABEL_MAX_GAP_PT = 28;
const PLAIN_IMAGE_LABEL_MIN_HORIZONTAL_OVERLAP_RATIO = 0.45;
const PLAIN_IMAGE_LABEL_MAX_CHARS = 120;
const IN_REGION_PLAIN_LABEL_MIN_REGION_AREA_RATIO = 0.08;
const IN_REGION_PLAIN_LABEL_MAX_CHARS = 100;
const IN_REGION_PLAIN_LABEL_MIN_WIDTH_PT = 80;
const IN_REGION_PLAIN_LABEL_MIN_WIDTH_RATIO = 0.25;
const IN_REGION_PLAIN_LABEL_TOP_DEPTH_RATIO = 0.3;
const IN_REGION_PLAIN_LABEL_TOP_DEPTH_MAX_PT = 96;
const IN_REGION_PLAIN_LABEL_MIN_HORIZONTAL_OVERLAP_RATIO = 0.35;
const IN_REGION_PLAIN_LABEL_SCORE_TOLERANCE_PT = 12;

function isPlainImageLabelText(text: string): boolean {
  const normalized = normalizeAssociatedText(text);
  if (normalized.length === 0 || normalized.length > PLAIN_IMAGE_LABEL_MAX_CHARS) return false;
  if (isCaptionText(normalized)) return false;
  if (/[。！？]/u.test(normalized)) return false;
  if (normalized.length > 80 && /[.!?]\s/u.test(normalized)) return false;
  if (/\b(?:copyright|licensed|cc\s+by|public domain|https?:\/\/|www\.)\b/iu.test(normalized)) return false;
  return /[\p{L}\p{N}]/u.test(normalized);
}

function isInRegionPlainLabelText(text: string): boolean {
  const normalized = normalizeAssociatedText(text);
  if (normalized.length === 0 || normalized.length > IN_REGION_PLAIN_LABEL_MAX_CHARS) return false;
  if (isCaptionText(normalized)) return false;
  if (/[。！？]/u.test(normalized)) return false;
  if (normalized.length > 80 && /[.!?]\s/u.test(normalized)) return false;
  if (/\b(?:copyright|licensed|cc\s+by|public domain|https?:\/\/|www\.)\b/iu.test(normalized)) return false;
  return /\p{L}/u.test(normalized);
}

function plainImageLabelScore(
  candidate: Candidate,
  block: NonNullable<PageLayout['blocks']>[number],
): number | undefined {
  if (candidate.kind !== 'raster') return undefined;
  if (candidate.associatedText && candidate.associatedText.length > 0) return undefined;
  if (block.repeated) return undefined;
  if (!isPlainImageLabelText(block.text)) return undefined;
  const blockBottom = block.y + block.height;
  const aboveGap = candidate.y - blockBottom;
  const regionBottom = candidate.y + candidate.height;
  const belowGap = block.y - regionBottom;
  let gap: number;
  if (aboveGap >= -4 && aboveGap <= PLAIN_IMAGE_LABEL_MAX_GAP_PT) {
    gap = Math.max(0, aboveGap);
  } else if (belowGap >= -4 && belowGap <= PLAIN_IMAGE_LABEL_MAX_GAP_PT) {
    gap = Math.max(0, belowGap);
  } else {
    return undefined;
  }

  const overlap = horizontalOverlapRatio(candidate, block);
  if (overlap < PLAIN_IMAGE_LABEL_MIN_HORIZONTAL_OVERLAP_RATIO) return undefined;
  return gap + (1 - overlap) * 24;
}

export function attachPlainImageLabels(candidates: Candidate[], layout: PageLayout | undefined): Candidate[] {
  const blocks = layout?.blocks ?? [];
  if (blocks.length === 0) return candidates;
  return candidates.map((candidate) => {
    const labels = blocks
      .map((block, blockIndex) => ({
        block,
        blockIndex,
        score: plainImageLabelScore(candidate, block),
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

function inRegionPlainLabelScore(
  candidate: Candidate,
  block: NonNullable<PageLayout['blocks']>[number],
  totalArea: number,
): number | undefined {
  if (candidate.kind !== 'raster' && candidate.kind !== 'mixed' && candidate.kind !== 'vector') return undefined;
  if (hasSourceType(candidate, 'layoutTable')) return undefined;
  if (candidate.associatedText && candidate.associatedText.length > 0) return undefined;
  if (areaRatio(candidate, totalArea) < IN_REGION_PLAIN_LABEL_MIN_REGION_AREA_RATIO) return undefined;
  if (block.role === 'heading' || block.repeated) return undefined;
  if (!isInRegionPlainLabelText(block.text)) return undefined;
  if (
    block.width < IN_REGION_PLAIN_LABEL_MIN_WIDTH_PT &&
    block.width / Math.max(1, candidate.width) < IN_REGION_PLAIN_LABEL_MIN_WIDTH_RATIO
  ) {
    return undefined;
  }

  const blockBottom = block.y + block.height;
  const insideDepth = block.y - candidate.y;
  const insideTopDepth = Math.min(
    candidate.height * IN_REGION_PLAIN_LABEL_TOP_DEPTH_RATIO,
    IN_REGION_PLAIN_LABEL_TOP_DEPTH_MAX_PT,
  );
  if (insideDepth < -4 || insideDepth > insideTopDepth || blockBottom > candidate.y + candidate.height + 4) {
    return undefined;
  }

  const overlap = horizontalOverlapRatio(candidate, block);
  if (overlap < IN_REGION_PLAIN_LABEL_MIN_HORIZONTAL_OVERLAP_RATIO) return undefined;
  const candidateCenter = candidate.x + candidate.width / 2;
  const blockCenter = block.x + block.width / 2;
  const centerPenalty = (Math.abs(candidateCenter - blockCenter) / Math.max(1, candidate.width)) * 20;
  return Math.max(0, insideDepth) + (1 - overlap) * 24 + centerPenalty;
}

export function attachInRegionPlainLabels(
  candidates: Candidate[],
  layout: PageLayout | undefined,
  totalArea: number,
): Candidate[] {
  const blocks = layout?.blocks ?? [];
  if (blocks.length === 0) return candidates;
  return candidates.map((candidate) => {
    const scoredLabels = blocks
      .map((block, blockIndex) => ({
        block,
        blockIndex,
        score: inRegionPlainLabelScore(candidate, block, totalArea),
      }))
      .filter(
        (item): item is { block: NonNullable<PageLayout['blocks']>[number]; blockIndex: number; score: number } =>
          item.score !== undefined,
      )
      .sort((a, b) => a.score - b.score);
    const bestScore = scoredLabels[0]?.score;
    const labels = scoredLabels
      .filter((item) => bestScore !== undefined && item.score <= bestScore + IN_REGION_PLAIN_LABEL_SCORE_TOLERANCE_PT)
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

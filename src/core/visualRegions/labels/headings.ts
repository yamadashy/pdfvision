import type { PageLayout } from '../../../types/index.js';
import { MAX_ASSOCIATED_TEXT, mergeAssociatedText, normalizeAssociatedText } from '../associatedText.js';
import { areaRatio, horizontalOverlapRatio, unionBox } from '../geometry.js';
import type { BoxLike, Candidate } from '../types.js';

const LABEL_MIN_HORIZONTAL_OVERLAP_RATIO = 0.2;
const HEADING_LABEL_MAX_GAP_PT = 96;
const HEADING_LABEL_MIN_REGION_AREA_RATIO = 0.08;
const HEADING_LABEL_MAX_CHARS = 220;
const HEADING_LABEL_INSIDE_TOP_DEPTH_RATIO = 0.3;
const HEADING_LABEL_INSIDE_TOP_DEPTH_MAX_PT = 72;
const HEADING_LABEL_INSIDE_BONUS = 48;
const HEADING_LABEL_LEVEL_PENALTY = 8;
const HEADING_LABEL_SCORE_TOLERANCE_PT = 12;

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
  const overlap = horizontalOverlapRatio(candidate, block);
  if (overlap < LABEL_MIN_HORIZONTAL_OVERLAP_RATIO) return undefined;
  const overlapPenalty = (1 - overlap) * 24;
  const levelPenalty = Math.max(0, (block.level ?? 1) - 1) * HEADING_LABEL_LEVEL_PENALTY;
  const insideDepth = block.y - candidate.y;
  const insideTopDepth = Math.min(
    candidate.height * HEADING_LABEL_INSIDE_TOP_DEPTH_RATIO,
    HEADING_LABEL_INSIDE_TOP_DEPTH_MAX_PT,
  );
  if (insideDepth >= -4 && insideDepth <= insideTopDepth && blockBottom <= candidate.y + candidate.height + 4) {
    return -HEADING_LABEL_INSIDE_BONUS + Math.max(0, insideDepth) * 0.25 + overlapPenalty + levelPenalty;
  }
  if (gap < -4 || gap > HEADING_LABEL_MAX_GAP_PT) return undefined;
  return gap + overlapPenalty + levelPenalty;
}

export function attachHeadingLabels(
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
        score: headingLabelScore(candidate, block, totalArea),
      }))
      .filter(
        (item): item is { block: NonNullable<PageLayout['blocks']>[number]; blockIndex: number; score: number } =>
          item.score !== undefined,
      )
      .sort((a, b) => a.score - b.score);
    const bestScore = scoredLabels[0]?.score;
    const labels = scoredLabels
      .filter((item) => bestScore !== undefined && item.score <= bestScore + HEADING_LABEL_SCORE_TOLERANCE_PT)
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

import type { PageLayout } from '../../../types/index.js';
import { MAX_ASSOCIATED_TEXT, mergeAssociatedText, normalizeAssociatedText } from '../associatedText.js';
import { isCaptionText } from '../captions.js';
import { areaRatio, horizontalOverlapRatio, unionBox } from '../geometry.js';
import type { BoxLike, Candidate } from '../types.js';

const PANEL_TITLE_MAX_GAP_PT = 42;
const PANEL_TITLE_MIN_HORIZONTAL_OVERLAP_RATIO = 0.2;
const PANEL_TITLE_MIN_REGION_AREA_RATIO = 0.04;
const PANEL_TITLE_MAX_CHARS = 260;
const PANEL_MARKER_PATTERN = /^\s*(?:\([A-Za-z]\)|Panel\s+\(?[A-Za-z]\)?\b)\s+/u;
const SUPPRESSED_TITLE_TEXT_PATTERN = /\b(?:copyright|licensed|cc\s+by|public domain|https?:\/\/|www\.)\b/iu;

function isPanelTitleText(text: string): boolean {
  const normalized = normalizeAssociatedText(text);
  if (normalized.length === 0 || normalized.length > PANEL_TITLE_MAX_CHARS) return false;
  if (!PANEL_MARKER_PATTERN.test(normalized)) return false;
  if (isCaptionText(normalized)) return false;
  if (SUPPRESSED_TITLE_TEXT_PATTERN.test(normalized)) return false;
  return /[\p{L}\p{N}]/u.test(normalized);
}

function panelTitleScore(
  candidate: Candidate,
  block: NonNullable<PageLayout['blocks']>[number],
  totalArea: number,
): number | undefined {
  if (candidate.kind !== 'raster' && candidate.kind !== 'mixed' && candidate.kind !== 'vector') return undefined;
  if (areaRatio(candidate, totalArea) < PANEL_TITLE_MIN_REGION_AREA_RATIO) return undefined;
  if (block.repeated) return undefined;
  if (!isPanelTitleText(block.text)) return undefined;

  const blockBottom = block.y + block.height;
  const gap = candidate.y - blockBottom;
  if (gap < -4 || gap > PANEL_TITLE_MAX_GAP_PT) return undefined;

  const overlap = horizontalOverlapRatio(candidate, block);
  if (overlap < PANEL_TITLE_MIN_HORIZONTAL_OVERLAP_RATIO) return undefined;
  return Math.max(0, gap) + (1 - overlap) * 24;
}

export function attachPanelTitleLabels(
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
        score: panelTitleScore(candidate, block, totalArea),
      }))
      .filter(
        (item): item is { block: NonNullable<PageLayout['blocks']>[number]; blockIndex: number; score: number } =>
          item.score !== undefined,
      )
      .sort((a, b) => a.score - b.score);
    const bestScore = scoredLabels[0]?.score;
    const labels = scoredLabels
      .filter((item) => bestScore !== undefined && item.score <= bestScore)
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

    const associatedText = mergeAssociatedText([...labels, ...(candidate.associatedText ?? [])]);
    const box = labels.reduce<BoxLike>((acc, label) => unionBox(acc, label), candidate);
    return { ...candidate, ...box, associatedText };
  });
}

import type { PageLayout } from '../../../types/index.js';
import { MAX_ASSOCIATED_TEXT, mergeAssociatedText, normalizeAssociatedText } from '../associatedText.js';
import { isCaptionText } from '../captions.js';
import { horizontalOverlapRatio, unionBox } from '../geometry.js';
import type { BoxLike, Candidate } from '../types.js';
import { hasSourceType } from './sources.js';

const LABEL_MIN_HORIZONTAL_OVERLAP_RATIO = 0.2;
const TABLE_LEAD_IN_LABEL_MAX_GAP_PT = 36;
const TABLE_LEAD_IN_LABEL_MAX_CHARS = 240;

function isTableLeadInLabelText(text: string): boolean {
  const normalized = normalizeAssociatedText(text);
  if (normalized.length === 0 || normalized.length > TABLE_LEAD_IN_LABEL_MAX_CHARS) return false;
  if (isCaptionText(normalized)) return false;
  if (/\b(?:copyright|licensed|cc\s+by|public domain|https?:\/\/|www\.)\b/iu.test(normalized)) return false;
  if (!/[\p{L}\p{N}]/u.test(normalized)) return false;
  return (
    /\btable\b/iu.test(normalized) ||
    /(?:as follows|following|below)\b/iu.test(normalized) ||
    /[:：]\s*$/u.test(normalized)
  );
}

function tableLeadInLabelScore(
  candidate: Candidate,
  block: NonNullable<PageLayout['blocks']>[number],
): number | undefined {
  if (candidate.associatedText && candidate.associatedText.length > 0) return undefined;
  if (!hasSourceType(candidate, 'layoutTable')) return undefined;
  if (block.repeated) return undefined;
  if (!isTableLeadInLabelText(block.text)) return undefined;

  const blockBottom = block.y + block.height;
  const aboveGap = candidate.y - blockBottom;
  const gap = aboveGap >= -4 ? Math.max(0, aboveGap) : Number.POSITIVE_INFINITY;
  if (gap > TABLE_LEAD_IN_LABEL_MAX_GAP_PT) return undefined;

  const overlap = horizontalOverlapRatio(candidate, block);
  if (overlap < LABEL_MIN_HORIZONTAL_OVERLAP_RATIO) return undefined;
  return gap + (1 - overlap) * 24;
}

export function attachTableLeadInLabels(candidates: Candidate[], layout: PageLayout | undefined): Candidate[] {
  const blocks = layout?.blocks ?? [];
  if (blocks.length === 0) return candidates;
  return candidates.map((candidate) => {
    const labels = blocks
      .map((block, blockIndex) => ({
        block,
        blockIndex,
        score: tableLeadInLabelScore(candidate, block),
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

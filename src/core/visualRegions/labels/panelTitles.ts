import type { PageLayout } from '../../../types/index.js';
import { MAX_ASSOCIATED_TEXT, mergeAssociatedText, normalizeAssociatedText } from '../associatedText.js';
import { isCaptionText } from '../captions.js';
import { areaRatio, horizontalOverlapRatio, unionBox } from '../geometry.js';
import type { BoxLike, Candidate } from '../types.js';

const PANEL_TITLE_MAX_GAP_PT = 42;
const PANEL_TITLE_MIN_HORIZONTAL_OVERLAP_RATIO = 0.2;
const PANEL_TITLE_MIN_REGION_AREA_RATIO = 0.035;
const PANEL_TITLE_MAX_CHARS = 260;
const PANEL_MARKER_PATTERN = /^\s*(?:[(（][A-Za-z\p{N}]+[)）]|Panel\s+[(（]?[A-Za-z\p{N}]+[)）]?\b)\s*/u;
const SUPPRESSED_TITLE_TEXT_PATTERN = /\b(?:copyright|licensed|cc\s+by|public domain|https?:\/\/|www\.)\b/iu;

interface PanelTitleFragment extends BoxLike {
  text: string;
  blockIndex: number;
  repeated?: boolean;
}

function isPanelTitleText(text: string): boolean {
  const normalized = normalizeAssociatedText(text);
  if (normalized.length === 0 || normalized.length > PANEL_TITLE_MAX_CHARS) return false;
  if (!PANEL_MARKER_PATTERN.test(normalized)) return false;
  if (isCaptionText(normalized)) return false;
  if (SUPPRESSED_TITLE_TEXT_PATTERN.test(normalized)) return false;
  return /[\p{L}\p{N}]/u.test(normalized);
}

function panelTitleScore(candidate: Candidate, fragment: PanelTitleFragment, totalArea: number): number | undefined {
  if (candidate.kind !== 'raster' && candidate.kind !== 'mixed' && candidate.kind !== 'vector') return undefined;
  if (areaRatio(candidate, totalArea) < PANEL_TITLE_MIN_REGION_AREA_RATIO) return undefined;
  if (fragment.repeated) return undefined;

  const fragmentBottom = fragment.y + fragment.height;
  const gap = candidate.y - fragmentBottom;
  if (gap < -4 || gap > PANEL_TITLE_MAX_GAP_PT) return undefined;

  const overlap = horizontalOverlapRatio(candidate, fragment);
  if (overlap < PANEL_TITLE_MIN_HORIZONTAL_OVERLAP_RATIO) return undefined;
  return Math.max(0, gap) + (1 - overlap) * 24;
}

function titleFragmentsFromBlock(
  block: NonNullable<PageLayout['blocks']>[number],
  blockIndex: number,
): PanelTitleFragment[] {
  const lineFragments = block.lines
    .filter((line) => isPanelTitleText(line.text))
    .map((line) => ({
      text: line.text,
      x: line.x,
      y: line.y,
      width: line.width,
      height: line.height,
      blockIndex,
      repeated: block.repeated,
    }));
  if (lineFragments.length > 0) return lineFragments;
  if (!isPanelTitleText(block.text)) return [];
  return [
    {
      text: block.text,
      x: block.x,
      y: block.y,
      width: block.width,
      height: block.height,
      blockIndex,
      repeated: block.repeated,
    },
  ];
}

export function attachPanelTitleLabels(
  candidates: Candidate[],
  layout: PageLayout | undefined,
  totalArea: number,
): Candidate[] {
  const blocks = layout?.blocks ?? [];
  if (blocks.length === 0) return candidates;
  const titleFragments = blocks.flatMap((block, blockIndex) => titleFragmentsFromBlock(block, blockIndex));
  return candidates.map((candidate) => {
    const scoredLabels = titleFragments
      .map((fragment) => ({
        fragment,
        score: panelTitleScore(candidate, fragment, totalArea),
      }))
      .filter((item): item is { fragment: PanelTitleFragment; score: number } => item.score !== undefined)
      .sort((a, b) => a.score - b.score);
    const bestScore = scoredLabels[0]?.score;
    const labels = scoredLabels
      .filter((item) => bestScore !== undefined && item.score <= bestScore)
      .slice(0, MAX_ASSOCIATED_TEXT)
      .map(({ fragment }) => ({
        text: normalizeAssociatedText(fragment.text),
        relation: 'label' as const,
        x: fragment.x,
        y: fragment.y,
        width: fragment.width,
        height: fragment.height,
        blockIndex: fragment.blockIndex,
      }));
    if (labels.length === 0) return candidate;

    const associatedText = mergeAssociatedText([...labels, ...(candidate.associatedText ?? [])]);
    const box = labels.reduce<BoxLike>((acc, label) => unionBox(acc, label), candidate);
    return { ...candidate, ...box, associatedText };
  });
}

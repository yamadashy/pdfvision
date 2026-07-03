import type { PageLayout, VisualRegionAssociatedText } from '../../types/index.js';
import { MAX_ASSOCIATED_TEXT, mergeAssociatedText, normalizeAssociatedText } from './associatedText.js';
import { horizontalOverlapRatio, unionBox } from './geometry.js';
import type { BoxLike, Candidate } from './types.js';

const SOURCE_LINE_MAX_GAP_PT = 56;
const SOURCE_LINE_MIN_HORIZONTAL_OVERLAP_RATIO = 0.3;
const SOURCE_LINE_SCORE_TOLERANCE_PT = 12;
const SOURCE_LINE_PATTERN = /^(?:sources?|資料|出典)\s*[:：]/iu;

interface SourceLineItem {
  text: VisualRegionAssociatedText;
}

export function attachSourceLines(candidates: Candidate[], layout: PageLayout | undefined): Candidate[] {
  const sourceLines = sourceLineItems(layout);
  if (sourceLines.length === 0) return candidates;

  return candidates.map((candidate) => {
    const attachedBlockIndexes = new Set(
      (candidate.associatedText ?? []).flatMap((text) => (text.blockIndex === undefined ? [] : [text.blockIndex])),
    );
    const scored = sourceLines
      .filter((item) => !attachedBlockIndexes.has(item.text.blockIndex ?? -1))
      .map((item) => ({ item, score: sourceLineScore(candidate, item.text) }))
      .filter((item): item is { item: SourceLineItem; score: number } => item.score !== undefined)
      .sort((a, b) => a.score - b.score);
    const bestScore = scored[0]?.score;
    if (bestScore === undefined) return candidate;

    const lines = scored
      .filter((item) => item.score <= bestScore + SOURCE_LINE_SCORE_TOLERANCE_PT)
      .slice(0, MAX_ASSOCIATED_TEXT);
    const associatedText = mergeAssociatedText([
      ...(candidate.associatedText ?? []),
      ...lines.map(({ item }) => item.text),
    ]);
    const box = lines.reduce<BoxLike>((acc, { item }) => unionBox(acc, item.text), candidate);
    return { ...candidate, ...box, associatedText };
  });
}

function sourceLineItems(layout: PageLayout | undefined): SourceLineItem[] {
  return (
    layout?.blocks.flatMap((block, blockIndex) => {
      if (block.repeated) return [];
      const lines = block.lines.length > 0 ? block.lines : [block];
      return lines.flatMap((line) => {
        const text = normalizeAssociatedText(line.text);
        if (!SOURCE_LINE_PATTERN.test(text)) return [];
        return [
          {
            text: {
              text,
              relation: 'caption' as const,
              x: line.x,
              y: line.y,
              width: line.width,
              height: line.height,
              blockIndex,
            },
          },
        ];
      });
    }) ?? []
  );
}

function sourceLineScore(candidate: Candidate, line: VisualRegionAssociatedText): number | undefined {
  const gap = line.y - (candidate.y + candidate.height);
  if (gap < -2 || gap > SOURCE_LINE_MAX_GAP_PT) return undefined;
  const overlap = horizontalOverlapRatio(candidate, line);
  if (overlap < SOURCE_LINE_MIN_HORIZONTAL_OVERLAP_RATIO) return undefined;
  return Math.max(0, gap) + (1 - overlap) * 24;
}

import type { PageLayout, VisualRegionAssociatedText } from '../../types/index.js';
import { MAX_ASSOCIATED_TEXT, mergeAssociatedText } from './associatedText.js';
import { captionTextsFromBlock } from './captions/extraction.js';
import { captionScore } from './captions/scoring.js';
import { captionKind, isGlobalCaptionText } from './captions/text.js';
import { unionBox } from './geometry.js';
import type { BoxLike, Candidate } from './types.js';

export { isCaptionText } from './captions/text.js';

const CAPTION_SCORE_TOLERANCE_PT = 12;

type CaptionKind = 'figure' | 'table' | 'plate';

export function attachCaptionText(candidates: Candidate[], layout: PageLayout | undefined): Candidate[] {
  const blocks = layout?.blocks ?? [];
  if (blocks.length === 0) return candidates;
  const captionItems = blocks.flatMap((block, index) =>
    block.repeated
      ? []
      : captionTextsFromBlock(block, index).map((associatedText) => ({
          text: associatedText,
          kind: captionKind(associatedText.text),
          global: isGlobalCaptionText(associatedText.text),
        })),
  );
  const globalCaptions = captionItems.filter((item) => item.global).slice(0, MAX_ASSOCIATED_TEXT);
  return candidates.map((candidate) => {
    const attachedCaptionBlockIndexes = new Set(
      (candidate.associatedText ?? [])
        .filter((text) => text.relation === 'caption' && text.blockIndex !== undefined)
        .map((text) => text.blockIndex),
    );
    const availableCaptionItems = captionItems.filter((item) => !attachedCaptionBlockIndexes.has(item.text.blockIndex));
    const availableGlobalCaptions = globalCaptions.filter(
      (item) => !attachedCaptionBlockIndexes.has(item.text.blockIndex),
    );
    const scoredCaptions = availableCaptionItems
      .map((item) => ({
        text: item.text,
        kind: item.kind,
        score: captionScore(candidate, item.text),
      }))
      .filter(
        (item): item is { text: VisualRegionAssociatedText; kind: CaptionKind | undefined; score: number } =>
          item.score !== undefined,
      )
      .sort((a, b) => a.score - b.score);
    const preferredCaptionKind = candidate.kind === 'table' ? 'table' : undefined;
    const preferredCaptions = preferredCaptionKind
      ? scoredCaptions.filter((caption) => caption.kind === preferredCaptionKind)
      : [];
    const captionPool = preferredCaptions.length > 0 ? preferredCaptions : scoredCaptions;
    const bestCaptionScore = captionPool[0]?.score;
    const captions =
      bestCaptionScore === undefined
        ? []
        : captionPool
            .filter((caption) => caption.score <= bestCaptionScore + CAPTION_SCORE_TOLERANCE_PT)
            .slice(0, MAX_ASSOCIATED_TEXT);
    if (captions.length === 0) {
      if (availableGlobalCaptions.length === 0) return candidate;
      const associatedText = mergeAssociatedText([
        ...(candidate.associatedText ?? []),
        ...availableGlobalCaptions.map((caption) => caption.text),
      ]);
      return { ...candidate, associatedText };
    }

    const associatedText = mergeAssociatedText([
      ...(candidate.associatedText ?? []),
      ...captions.map((caption) => caption.text),
    ]);
    const box = captions.reduce<BoxLike>((acc, caption) => unionBox(acc, caption.text), candidate);
    return { ...candidate, ...box, associatedText };
  });
}

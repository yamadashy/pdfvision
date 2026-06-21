import { horizontalOverlapRatio, overlapArea, overlapOfSmaller } from '../geometry.js';
import type { BoxLike, Candidate } from '../types.js';
import { isBareCaptionReferenceText } from './text.js';

const CAPTION_MAX_GAP_PT = 54;
const CAPTION_MIN_HORIZONTAL_OVERLAP_RATIO = 0.2;
const MIN_CONTAINED_CAPTION_HEIGHT_PT = 6;

export function captionScore(candidate: Candidate, textBox: BoxLike): number | undefined {
  const contained = overlapOfSmaller(candidate, textBox) >= 0.9;
  if (contained) {
    if (textBox.height < MIN_CONTAINED_CAPTION_HEIGHT_PT) return undefined;
    if ('text' in textBox && typeof textBox.text === 'string' && isBareCaptionReferenceText(textBox.text)) {
      return undefined;
    }
  }

  const captionBottom = textBox.y + textBox.height;
  const regionBottom = candidate.y + candidate.height;
  const belowGap = textBox.y - regionBottom;
  const aboveGap = candidate.y - captionBottom;
  const overlapsVertically = overlapArea(candidate, textBox) > 0;
  const gap = overlapsVertically ? 0 : belowGap >= 0 ? belowGap : aboveGap >= 0 ? aboveGap : Number.POSITIVE_INFINITY;
  if (gap > CAPTION_MAX_GAP_PT) return undefined;

  const overlap = horizontalOverlapRatio(candidate, textBox);
  if (overlap < CAPTION_MIN_HORIZONTAL_OVERLAP_RATIO) return undefined;
  const belowBonus = belowGap >= -4 ? 0 : 12;
  return gap + (1 - overlap) * 30 + belowBonus;
}

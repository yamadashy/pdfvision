import type { LayoutBlock } from '../../types/index.js';
import { isDuplicateExtractionPair } from './duplicates.js';
import { isInlineFragmentPair } from './inlineFragments.js';
import { isLooseLineContinuationPair } from './lineContinuation.js';
import { isDisplayNumberLabelPair, isIconMarkerPair } from './visualMarkers.js';

export function shouldSuppressTextOverlapPair(a: LayoutBlock, b: LayoutBlock): boolean {
  return (
    isLooseLineContinuationPair(a, b) ||
    isInlineFragmentPair(a, b) ||
    isDisplayNumberLabelPair(a, b) ||
    isIconMarkerPair(a, b) ||
    isDuplicateExtractionPair(a, b)
  );
}

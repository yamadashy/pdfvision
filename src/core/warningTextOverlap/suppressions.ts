import type { LayoutBlock } from '../../types/index.js';
import { isDuplicateExtractionPair } from './duplicates.js';
import { isInlineFragmentPair } from './inlineFragments.js';
import { isLooseLineContinuationPair } from './lineContinuation.js';
import { isDottedTextureBlock } from './punctuationNoise.js';
import { isDisplayNumberLabelPair, isIconMarkerPair } from './visualMarkers.js';

export function shouldSuppressTextOverlapPair(a: LayoutBlock, b: LayoutBlock): boolean {
  return (
    isVerticalTextPair(a, b) ||
    isDottedTextureBlock(a) ||
    isDottedTextureBlock(b) ||
    isLooseLineContinuationPair(a, b) ||
    isInlineFragmentPair(a, b) ||
    isDisplayNumberLabelPair(a, b) ||
    isIconMarkerPair(a, b) ||
    isDuplicateExtractionPair(a, b)
  );
}

function isVerticalTextPair(a: LayoutBlock, b: LayoutBlock): boolean {
  // Adjacent vertical-writing columns share broad reading bands; block
  // bboxes can overlap even when the glyph columns are cleanly separated.
  return a.writingMode === 'vertical' && b.writingMode === 'vertical';
}

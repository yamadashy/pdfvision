import type { LayoutBlock } from '../../types/index.js';
import { intersectionArea, verticalIntersectionDepth } from './geometry.js';
import { isInlinePunctuationLinePair, isMathAnnotationLinePair } from './inlineFragments.js';

const TEXT_OVERLAP_MIN_DEPTH_RATIO = 0.5;

export function textOverlapArea(a: LayoutBlock, b: LayoutBlock): number {
  const aBoxes = a.lines.length > 0 ? a.lines : [a];
  const bBoxes = b.lines.length > 0 ? b.lines : [b];
  let total = 0;
  for (const aa of aBoxes) {
    for (const bb of bBoxes) {
      if (isInlinePunctuationLinePair(aa, bb)) continue;
      if (isMathAnnotationLinePair(aa, bb, a, b) || isMathAnnotationLinePair(bb, aa, b, a)) continue;
      const depth = verticalIntersectionDepth(aa, bb);
      const minHeight = Math.max(Math.min(aa.height, bb.height), 0.001);
      if (depth / minHeight < TEXT_OVERLAP_MIN_DEPTH_RATIO) continue;
      total += intersectionArea(aa, bb);
    }
  }
  return total;
}

import type { LayoutBlock } from '../../types/index.js';
import { lineCells } from '../layout/rows/index.js';
import { intersectionArea, verticalIntersectionDepth } from './geometry.js';
import { isInlinePunctuationLinePair, isMathAnnotationLinePair } from './inlineFragments.js';

const TEXT_OVERLAP_MIN_DEPTH_RATIO = 0.5;

export function textOverlapArea(a: LayoutBlock, b: LayoutBlock): number {
  // A row joined from cells spans the gaps between them; only the cells hold text.
  // Only lines inside the other block's box can add area; a large block meets
  // most others with a few of its lines, so the pairs are cut down first.
  const aBoxes = (a.lines.length > 0 ? lineCells(a.lines) : [a]).filter((box) => intersectionArea(box, b) > 0);
  const bBoxes = (b.lines.length > 0 ? lineCells(b.lines) : [b]).filter((box) => intersectionArea(box, a) > 0);
  let total = 0;
  for (const aa of aBoxes) {
    for (const bb of bBoxes) {
      const area = intersectionArea(aa, bb);
      if (area <= 0) continue;
      if (isInlinePunctuationLinePair(aa, bb)) continue;
      if (isMathAnnotationLinePair(aa, bb, a, b) || isMathAnnotationLinePair(bb, aa, b, a)) continue;
      const depth = verticalIntersectionDepth(aa, bb);
      const minHeight = Math.max(Math.min(aa.height, bb.height), 0.001);
      if (depth / minHeight < TEXT_OVERLAP_MIN_DEPTH_RATIO) continue;
      total += area;
    }
  }
  return total;
}

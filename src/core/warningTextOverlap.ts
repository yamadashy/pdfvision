import type { LayoutBlock, PageWarning } from '../types/index.js';
import { boxesIntersect } from './warningTextOverlap/geometry.js';
import { textOverlapArea } from './warningTextOverlap/overlapArea.js';
import { shouldSuppressTextOverlapPair } from './warningTextOverlap/suppressions.js';

const TEXT_OVERLAP_MAX_DETAILED_WARNINGS = 8;

interface TextOverlapCandidate {
  blockIndex: number;
  otherBlockIndex: number;
  overlapArea: number;
}

export { horizontalOverlap } from './warningTextOverlap/geometry.js';

export function detectTextOverlap(blocks: LayoutBlock[], out: PageWarning[]): void {
  const overlaps: TextOverlapCandidate[] = [];
  let overlapCount = 0;
  // Only non-repeated pairs: repeated chrome legitimately occupies margins,
  // and `body_near_repeated_chrome` covers the body/footer collision case.
  for (let i = 0; i < blocks.length; i++) {
    const a = blocks[i];
    if (a.repeated) continue;
    for (let j = i + 1; j < blocks.length; j++) {
      const b = blocks[j];
      if (b.repeated) continue;
      if (!boxesIntersect(a, b)) continue;
      if (shouldSuppressTextOverlapPair(a, b)) continue;
      const overlapArea = textOverlapArea(a, b);
      if (overlapArea < 1) continue;
      overlapCount += 1;
      rememberTopTextOverlap(overlaps, { blockIndex: i, otherBlockIndex: j, overlapArea });
    }
  }
  emitTextOverlapWarnings(overlaps, overlapCount, out);
}

function rememberTopTextOverlap(overlaps: TextOverlapCandidate[], candidate: TextOverlapCandidate): void {
  overlaps.push(candidate);
  overlaps.sort(compareTextOverlapCandidates);
  if (overlaps.length > TEXT_OVERLAP_MAX_DETAILED_WARNINGS) overlaps.pop();
}

function compareTextOverlapCandidates(a: TextOverlapCandidate, b: TextOverlapCandidate): number {
  return b.overlapArea - a.overlapArea || a.blockIndex - b.blockIndex || a.otherBlockIndex - b.otherBlockIndex;
}

function emitTextOverlapWarnings(overlaps: TextOverlapCandidate[], overlapCount: number, out: PageWarning[]): void {
  const sorted = [...overlaps].sort(compareTextOverlapCandidates);
  for (const overlap of sorted.slice(0, TEXT_OVERLAP_MAX_DETAILED_WARNINGS)) {
    out.push({
      code: 'text_overlap',
      severity: 'warning',
      message: `block bboxes overlap (${overlap.overlapArea.toFixed(1)}pt²) — text from different blocks may visually collide`,
      blockIndex: overlap.blockIndex,
      otherBlockIndex: overlap.otherBlockIndex,
    });
  }
  const omitted = overlapCount - sorted.length;
  if (omitted <= 0) return;
  out.push({
    code: 'text_overlap',
    severity: 'warning',
    message: `${omitted} additional block bbox overlap${omitted === 1 ? '' : 's'} omitted after showing the ${TEXT_OVERLAP_MAX_DETAILED_WARNINGS} largest overlaps`,
  });
}

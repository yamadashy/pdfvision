import { hasSourceType } from './candidateMerge.js';
import type { Candidate } from './types.js';

const CROSS_COLUMN_LEFT_RATIO = 0.45;
const CROSS_COLUMN_RIGHT_RATIO = 0.55;
const CAPTION_COLUMN_MARGIN_PT = 24;
const TABLE_CAPTION_PATTERN = /^table\s*\d*/iu;

export function clampCrossColumnTableCandidatesToCaptionColumn(
  candidates: Candidate[],
  pageWidth: number,
): Candidate[] {
  if (pageWidth <= 0) return candidates;
  const center = pageWidth / 2;

  return candidates.map((candidate) => {
    if (!isClampableCrossColumnTableCandidate(candidate, pageWidth)) return candidate;
    const caption = candidate.associatedText?.find(
      (text) => text.relation === 'caption' && TABLE_CAPTION_PATTERN.test(text.text.trim()),
    );
    if (!caption) return candidate;

    if (caption.x >= center) {
      const x = Math.max(candidate.x, caption.x - CAPTION_COLUMN_MARGIN_PT);
      if (x >= candidate.x + candidate.width) return candidate;
      return { ...candidate, x, width: candidate.x + candidate.width - x };
    }
    if (caption.x + caption.width <= center) {
      const right = Math.min(candidate.x + candidate.width, caption.x + caption.width + CAPTION_COLUMN_MARGIN_PT);
      if (right <= candidate.x) return candidate;
      return { ...candidate, width: right - candidate.x };
    }
    return candidate;
  });
}

function isClampableCrossColumnTableCandidate(candidate: Candidate, pageWidth: number): boolean {
  if (candidate.kind !== 'table' && candidate.kind !== 'mixed') return false;
  if (!hasSourceType(candidate, 'layoutTable')) return false;
  return (
    candidate.x < pageWidth * CROSS_COLUMN_LEFT_RATIO &&
    candidate.x + candidate.width > pageWidth * CROSS_COLUMN_RIGHT_RATIO
  );
}

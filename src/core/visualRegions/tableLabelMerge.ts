import { associatedTextKey } from './associatedText.js';
import { hasSourceType, mergeCandidates } from './candidateMerge.js';
import { horizontalOverlapRatio } from './geometry.js';
import type { Candidate } from './types.js';

const SAME_LABEL_TABLE_HORIZONTAL_OVERLAP_RATIO = 0.9;
const SAME_LABEL_TABLE_MAX_VERTICAL_GAP_PT = 24;

export function mergeStackedSameLabelTableCandidates(candidates: Candidate[]): Candidate[] {
  const merged: Candidate[] = [];
  for (const candidate of candidates) {
    const index = merged.findIndex((existing) => canMergeStackedSameLabelTables(existing, candidate));
    if (index === -1) {
      merged.push(candidate);
      continue;
    }
    merged[index] = mergeCandidates(merged[index], candidate);
  }
  return merged;
}

function canMergeStackedSameLabelTables(a: Candidate, b: Candidate): boolean {
  if (!isLayoutTableCandidate(a) || !isLayoutTableCandidate(b)) return false;
  if (!shareAssociatedText(a, b)) return false;
  if (horizontalOverlapRatio(a, b) < SAME_LABEL_TABLE_HORIZONTAL_OVERLAP_RATIO) return false;
  return verticalGap(a, b) <= SAME_LABEL_TABLE_MAX_VERTICAL_GAP_PT;
}

function isLayoutTableCandidate(candidate: Candidate): boolean {
  return (candidate.kind === 'table' || candidate.kind === 'mixed') && hasSourceType(candidate, 'layoutTable');
}

function shareAssociatedText(a: Candidate, b: Candidate): boolean {
  if (!a.associatedText || !b.associatedText) return false;
  const aKeys = new Set(a.associatedText.map(associatedTextKey));
  return b.associatedText.some((text) => aKeys.has(associatedTextKey(text)));
}

function verticalGap(a: Candidate, b: Candidate): number {
  return Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height), 0);
}

import { hasSourceType, mergeCandidates } from './candidateMerge.js';
import { horizontalOverlapRatio } from './geometry.js';
import type { Candidate } from './types.js';

const TABLE_HEADER_MAX_VERTICAL_GAP_PT = 28;
const TABLE_HEADER_MAX_TABLE_OVERLAP_RATIO = 0.18;
const TABLE_HEADER_MAX_HEIGHT_TO_TABLE_RATIO = 0.75;
const TABLE_HEADER_MIN_HORIZONTAL_OVERLAP_RATIO = 0.85;
const TABLE_HEADER_MIN_WIDTH_TO_TABLE_RATIO = 0.3;
const TABLE_HEADER_MAX_WIDTH_TO_TABLE_RATIO = 1.25;

export function mergeTableHeaderCandidatesIntoFollowingTables(candidates: Candidate[]): Candidate[] {
  const consumedHeaders = new Set<number>();
  const merged = candidates.map((candidate, index) => {
    if (!isLayoutTableCandidate(candidate)) return candidate;

    const headerIndex = bestHeaderCandidateIndex(candidates, index, consumedHeaders);
    if (headerIndex === -1) return candidate;

    consumedHeaders.add(headerIndex);
    return mergeHeaderIntoTable(candidates[headerIndex], candidate);
  });

  return merged.filter((_, index) => !consumedHeaders.has(index));
}

function bestHeaderCandidateIndex(
  candidates: readonly Candidate[],
  tableIndex: number,
  consumedHeaders: Set<number>,
): number {
  let bestIndex = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  const table = candidates[tableIndex];

  for (const [index, candidate] of candidates.entries()) {
    if (index === tableIndex || consumedHeaders.has(index)) continue;
    if (!canMergeHeaderCandidateIntoTable(candidate, table)) continue;

    const gap = Math.max(0, table.y - (candidate.y + candidate.height));
    const score = gap + Math.abs(table.x - candidate.x) / 10;
    if (score >= bestScore) continue;
    bestIndex = index;
    bestScore = score;
  }

  return bestIndex;
}

function canMergeHeaderCandidateIntoTable(header: Candidate, table: Candidate): boolean {
  if (!isLayoutTableCandidate(table)) return false;
  if (!isTableHeaderLikeCandidate(header)) return false;
  if (header.y >= table.y) return false;
  if (header.height > table.height * TABLE_HEADER_MAX_HEIGHT_TO_TABLE_RATIO) return false;
  if (header.width < table.width * TABLE_HEADER_MIN_WIDTH_TO_TABLE_RATIO) return false;
  if (header.width > table.width * TABLE_HEADER_MAX_WIDTH_TO_TABLE_RATIO) return false;
  if (horizontalOverlapRatio(header, table) < TABLE_HEADER_MIN_HORIZONTAL_OVERLAP_RATIO) return false;

  const headerBottom = header.y + header.height;
  const gap = table.y - headerBottom;
  if (gap > TABLE_HEADER_MAX_VERTICAL_GAP_PT) return false;

  const overlapIntoTable = Math.max(0, headerBottom - table.y);
  return overlapIntoTable <= table.height * TABLE_HEADER_MAX_TABLE_OVERLAP_RATIO;
}

function isLayoutTableCandidate(candidate: Candidate): boolean {
  return (candidate.kind === 'table' || candidate.kind === 'mixed') && hasSourceType(candidate, 'layoutTable');
}

function isTableHeaderLikeCandidate(candidate: Candidate): boolean {
  if (candidate.kind !== 'table' && candidate.kind !== 'mixed' && candidate.kind !== 'vector') return false;
  return hasSourceType(candidate, 'layoutTable') || hasSourceType(candidate, 'vectorBox');
}

function mergeHeaderIntoTable(header: Candidate, table: Candidate): Candidate {
  const merged = mergeCandidates(table, header);
  return table.kind === 'table' ? { ...merged, kind: 'table' } : merged;
}

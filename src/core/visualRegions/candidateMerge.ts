import type { VisualRegionSource } from '../../types/index.js';
import { mergeAssociatedText } from './associatedText.js';
import { unionBox } from './geometry.js';
import type { Candidate } from './types.js';

function sourceKey(source: VisualRegionSource): string {
  return `${source.type}:${source.index}`;
}

export function hasSourceType(candidate: Candidate, type: VisualRegionSource['type']): boolean {
  return candidate.sources.some((source) => source.type === type);
}

export function mergeSources(sources: readonly VisualRegionSource[]): VisualRegionSource[] {
  const seen = new Set<string>();
  const merged: VisualRegionSource[] = [];
  for (const source of sources) {
    const key = sourceKey(source);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(source);
  }
  return merged.sort((a, b) => (a.type === b.type ? a.index - b.index : a.type.localeCompare(b.type)));
}

export function mergeCandidates(a: Candidate, b: Candidate): Candidate {
  const box = unionBox(a, b);
  const sources = mergeSources([...a.sources, ...b.sources]);
  const associatedText = mergeAssociatedText([...(a.associatedText ?? []), ...(b.associatedText ?? [])]);
  return {
    ...box,
    kind: a.kind === b.kind ? a.kind : 'mixed',
    priority: Math.max(a.priority, b.priority),
    reason: a.reason === b.reason ? a.reason : `${a.reason}; ${b.reason}`,
    sources,
    ...(associatedText.length > 0 && { associatedText }),
  };
}

export function mergeCandidateMetadataInto(primary: Candidate, duplicate: Candidate): Candidate {
  const sources = mergeSources([...primary.sources, ...duplicate.sources]);
  const associatedText = mergeAssociatedText([...(primary.associatedText ?? []), ...(duplicate.associatedText ?? [])]);
  return {
    ...primary,
    kind: primary.kind === duplicate.kind ? primary.kind : 'mixed',
    priority: Math.max(primary.priority, duplicate.priority),
    reason: mergeCandidateReasons(primary, duplicate, sources),
    sources,
    ...(associatedText.length > 0 && { associatedText }),
  };
}

function mergeCandidateReasons(
  primary: Candidate,
  duplicate: Candidate,
  sources: readonly VisualRegionSource[],
): string {
  if (primary.reason === duplicate.reason) {
    return normalizeMergedReason(primary.reason, sources);
  }
  return normalizeMergedReason(
    mergeReasonsBySourceCoverage(primary, duplicate) ?? `${primary.reason}; ${duplicate.reason}`,
    sources,
  );
}

function normalizeMergedReason(reason: string, sources: readonly VisualRegionSource[]): string {
  const vectorSourceCount = sources.filter((source) => source.type === 'vectorBox').length;
  const segments = reason.split('; ');
  const seen = new Set<string>();
  const normalized: string[] = [];
  let emittedVectorSegment = false;
  for (const segment of segments) {
    if (/^\d+ nearby vector drawing operations$/u.test(segment) && vectorSourceCount > 0) {
      if (!emittedVectorSegment) normalized.push(`${vectorSourceCount} nearby vector drawing operations`);
      emittedVectorSegment = true;
      continue;
    }
    if (seen.has(segment)) continue;
    seen.add(segment);
    normalized.push(segment);
  }
  return normalized.join('; ');
}

function mergeReasonsBySourceCoverage(primary: Candidate, duplicate: Candidate): string | undefined {
  if (primary.reason.startsWith(duplicate.reason)) return primary.reason;
  if (duplicate.reason.startsWith(primary.reason)) return duplicate.reason;
  return undefined;
}

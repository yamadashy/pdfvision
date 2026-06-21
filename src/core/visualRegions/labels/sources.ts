import type { VisualRegionSource } from '../../../types/index.js';
import type { Candidate } from '../types.js';

export function hasSourceType(candidate: Candidate, type: VisualRegionSource['type']): boolean {
  return candidate.sources.some((source) => source.type === type);
}

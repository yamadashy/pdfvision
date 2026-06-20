import type { VisualRegionAssociatedText, VisualRegionKind, VisualRegionSource } from '../../types/index.js';

export interface BoxLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Candidate extends BoxLike {
  kind: VisualRegionKind;
  priority: number;
  reason: string;
  sources: VisualRegionSource[];
  associatedText?: VisualRegionAssociatedText[];
}

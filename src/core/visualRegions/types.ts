import type {
  FormField,
  ImageBox,
  PageAnnotation,
  PageLayout,
  PageQuality,
  VectorBox,
  VisualRegionAssociatedText,
  VisualRegionKind,
  VisualRegionSource,
} from '../../types/index.js';

export interface BuildVisualRegionsInput {
  pageWidth: number;
  pageHeight: number;
  imageBoxes: readonly ImageBox[];
  vectorBoxes?: readonly VectorBox[];
  layout?: PageLayout;
  formFields?: readonly FormField[];
  annotations?: readonly PageAnnotation[];
  visualStatus?: 'ok' | 'sparse' | 'blank';
  nativeTextStatus?: PageQuality['nativeTextStatus'];
  renderContentRatio?: number;
}

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

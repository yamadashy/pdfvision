import type {
  FormField,
  ImageBox,
  PageAnnotation,
  PageLayout,
  PageLink,
  PageStructureNode,
  PageStructureTable,
  TextSpan,
  VectorBox,
} from '../../types/index.js';
import type { InvisibleTextEvidence } from '../graphics/invisibleText.js';
import type { BuildVisualRegionsInput } from '../visualRegions/index.js';

export interface PageData {
  text: string;
  rawText?: string;
  charCount: number;
  imageCount: number;
  rasterBackedTextLayer: boolean;
  optionalContentText: boolean;
  vectorCount: number;
  textCoverage: number;
  nonPrintableRatio: number;
  nonPrintableCount: number;
  rotation?: number;
  width: number;
  height: number;
  spans?: TextSpan[];
  /** Spans built internally (independent of `flags.geometry`) for
   *  downstream search bbox computation. May filter text that is
   *  deliberately excluded from searchable body flow, while the public
   *  PageResult.spans gating stays the simple "geometry on / off" rule. */
  _internalSpans?: TextSpan[];
  /** Internal spans used for warnings even when public pages[].spans
   *  was not requested. */
  _warningSpans?: TextSpan[];
  _invisibleText?: InvisibleTextEvidence;
  layout?: PageLayout;
  imageBoxes?: ImageBox[];
  _warningImageBoxes?: ImageBox[];
  vectorBoxes?: VectorBox[];
  _warningVectorBoxes?: VectorBox[];
  _warningAnnotations?: PageAnnotation[];
  _visualRegionInput?: BuildVisualRegionsInput;
  hasVisibleAnnotationAppearance?: boolean;
  formFieldCount?: number;
  formFields?: FormField[];
  _internalFormFields?: FormField[];
  linkCount?: number;
  links?: PageLink[];
  _internalLinks?: PageLink[];
  annotationCount?: number;
  annotations?: PageAnnotation[];
  _internalAnnotations?: PageAnnotation[];
  structure?: PageStructureNode | null;
  structureTables?: PageStructureTable[];
  jsActions?: Record<string, string[]>;
}

export interface PageFlags {
  normalize: boolean;
  geometry: boolean;
  layout: boolean;
  imageBoxes: boolean;
  vectorBoxes: boolean;
  visualRegions: boolean;
  formFields: boolean;
  links: boolean;
  annotations: boolean;
  annotationAppearanceHints: boolean;
  structure: boolean;
  viewer: boolean;
  /** Build spans internally even when neither `geometry` nor `layout`
   *  was requested. Search needs them for per-match bbox; the public
   *  `pages[].spans` payload still requires `geometry`. */
  needSpansForSearch: boolean;
  /** Build spans internally for always-on warning rules without
   *  exposing pages[].spans unless geometry was requested. */
  needSpansForWarnings: boolean;
  /** Build form fields internally so search can find visible widget
   *  values without forcing pages[].formFields into the public payload. */
  needFormFieldsForSearch: boolean;
  /** Build annotations internally so search can find visible FreeText
   *  annotations without forcing pages[].annotations into the public payload. */
  needAnnotationsForSearch: boolean;
  /** Build links internally so search can find URL / destination /
   *  attachment targets without forcing pages[].links into output. */
  needLinksForSearch: boolean;
}

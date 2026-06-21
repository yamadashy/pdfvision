export interface PageAnnotationBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageAnnotationFileAttachment {
  /** Embedded filename shown by the file-attachment annotation. */
  name: string;
  /** Optional attachment description when the PDF provides one. */
  description?: string;
  /** Attachment byte length. Bytes are intentionally not embedded in output. */
  size: number;
}

export interface PageAnnotationPoint {
  x: number;
  y: number;
}

export interface PageAnnotationBorder {
  /** Border width in PDF points. */
  width?: number;
  /** PDF border style such as solid, dashed, beveled, inset, or underline. */
  style?: string;
  /** Dash pattern for dashed borders when present. */
  dashArray?: number[];
}

export interface PageAnnotationLine {
  from: PageAnnotationPoint;
  to: PageAnnotationPoint;
  /** PDF line ending names, e.g. None, Square, Circle, OpenArrow. */
  endings?: [string, string];
}

export type PageAnnotationFlag =
  | 'invisible'
  | 'hidden'
  | 'print'
  | 'noZoom'
  | 'noRotate'
  | 'noView'
  | 'readOnly'
  | 'locked'
  | 'toggleNoView'
  | 'lockedContents';

export interface PageAnnotation {
  /** PDF annotation subtype such as Text, Highlight, Underline, StrikeOut, FreeText, Stamp, FileAttachment, or Ink. */
  subtype: string;
  /** PDF annotation / icon name, such as Note, Comment, PushPin, or Paperclip, when available. */
  name?: string;
  /** Comment / markup contents when the PDF provides them. */
  contents?: string;
  /** Annotation title / author label when the PDF provides it. */
  title?: string;
  /** RGB annotation color, 0..255 per channel. */
  color?: [number, number, number];
  /** PDF modification date string when available. */
  modified?: string;
  /** Whether pdf.js reports an appearance stream for this annotation. */
  hasAppearance?: boolean;
  /** File metadata for FileAttachment annotations. Bytes are never embedded in structured output. */
  fileAttachment?: PageAnnotationFileAttachment;
  /** Decoded PDF annotation flags, such as hidden, print, noView, or locked. */
  flags?: PageAnnotationFlag[];
  /** Border styling for shape and markup annotations when pdf.js exposes it. */
  border?: PageAnnotationBorder;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Precise markup quadrilateral boxes, present when the PDF provides QuadPoints. */
  quadBoxes?: PageAnnotationBox[];
  /** Line start/end coordinates for Line annotations, in top-left PDF points. */
  line?: PageAnnotationLine;
  /** Vertices for Polygon and PolyLine annotations, in top-left PDF points. */
  vertices?: PageAnnotationPoint[];
  /** Freehand paths for Ink annotations, in top-left PDF points. */
  inkPaths?: PageAnnotationPoint[][];
}

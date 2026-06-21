export interface PageStructureContent {
  /** pdf.js structure reference type, usually `content`, `object`, or `annotation`. */
  type: string;
  /** Unique pdf.js id that maps this structure item to marked content, an object, or an annotation. */
  id: string;
}

export type PageStructureItem = PageStructureNode | PageStructureContent;

export interface PageStructureNode {
  /** Tagged-PDF role, already role-map-resolved by pdf.js when possible. */
  role: string;
  /** Alternate text, commonly used for figures or formula descriptions; control bytes are removed. */
  alt?: string;
  /** MathML emitted by pdf.js for tagged Formula nodes when available. */
  mathML?: string;
  /** Language hint for this structure node. */
  lang?: string;
  /** Optional structure-node bbox as [x, y, width, height] in top-left PDF points when pdf.js exposes one. */
  bbox?: number[];
  /** Nested structure nodes or marked-content/object references. */
  children: PageStructureItem[];
}

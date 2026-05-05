export type OutputFormat = 'text' | 'json';

/**
 * Options for the structured `processDocument()` API.
 * Independent of formatting concerns: format / pretty-printing / etc. are
 * the caller's responsibility once they have the structured result.
 */
export interface ProcessDocumentOptions {
  /** Pages selector, e.g. "1-5", "3", "1,3,5". Omitted = all pages. */
  pages?: string;
  /** Render each selected page to PNG and include the path in `pages[].image`. */
  render?: boolean;
  /** Skip the on-disk cache, always re-extract. Defaults to `false`. */
  noCache?: boolean;
}

export interface ProcessOptions {
  pages?: string;
  format: OutputFormat;
  noCache: boolean;
  render?: boolean;
}

export interface PageResult {
  page: number;
  text: string;
  image?: string;
  /** Length (in code units) of `text`. Useful for detecting image-only slides. */
  charCount: number;
  /** Number of raster image objects drawn on the page (XObject + inline + mask). */
  imageCount: number;
  /**
   * Approximate fraction of page area covered by text glyph boxes (0–1).
   * A heuristic — items can overlap, so this is clamped to ≤ 1. Low values
   * (e.g. < 0.05) suggest the page is dominated by images rather than text.
   */
  textCoverage: number;
}

export interface DocumentMetadata {
  title: string | null;
  author: string | null;
  subject: string | null;
  creator: string | null;
}

export interface DocumentResult {
  file: string;
  totalPages: number;
  metadata: DocumentMetadata;
  pages: PageResult[];
}

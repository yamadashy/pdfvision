export type OutputFormat = 'text' | 'json' | 'markdown';

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
  /**
   * Directory to write rendered PNGs into. Only used when `render` is true.
   * If unset, pdfvision picks a path under the cache (or OS tmp) directory.
   * The directory is created if it doesn't already exist.
   */
  renderOutput?: string;
  /**
   * Apply Unicode NFKC normalization to extracted text and metadata strings.
   * Defaults to `true`. PDFs (especially Japanese ones produced by Office /
   * iWork) frequently embed compatibility codepoints like `⽬` (U+2F6C) in
   * place of `目` (U+76EE), which silently break grep / diff / structured
   * extraction downstream. Pass `false` if you specifically need the raw
   * code points emitted by pdf.js.
   */
  normalize?: boolean;
  /**
   * Emit per-text-item geometry in `pages[].spans`. Off by default because
   * spans can outnumber the textual length by 5–10× and bloat JSON output.
   * Turn on when a downstream consumer needs to reconstruct headings,
   * tables, multi-column reading order, or to overlay bboxes on the
   * rendered PNG.
   */
  geometry?: boolean;
}

export interface ProcessOptions {
  pages?: string;
  format: OutputFormat;
  noCache: boolean;
  render?: boolean;
  renderOutput?: string;
  normalize?: boolean;
  geometry?: boolean;
}

/**
 * One text-positioned glyph run as emitted by pdf.js. Coordinates are in
 * PDF points and use a top-down origin (0, 0) at the top-left of the page,
 * y increases downward — matching the rendered PNG convention so callers
 * can overlay spans on `image` directly without flipping.
 */
export interface TextSpan {
  /** Glyph run text. Already NFKC-normalized when `normalize` is on. */
  text: string;
  /** Top-left x in PDF points (origin: page top-left). */
  x: number;
  /** Top-left y in PDF points (origin: page top-left, y grows downward). */
  y: number;
  /** Glyph run width in PDF points. */
  width: number;
  /** Glyph run height in PDF points. Approximated from the text matrix when pdf.js reports 0. */
  height: number;
  /** Approximate font size in PDF points (max of horizontal and vertical text-matrix scales). */
  fontSize: number;
  /** pdf.js internal font name (e.g. `g_d0_f1`). Useful for grouping items by font. */
  fontName?: string;
}

export interface PageResult {
  page: number;
  text: string;
  /**
   * Pre-normalization form of `text`. Only present when NFKC normalization
   * was applied (the default) AND it actually changed the string — i.e.
   * the source PDF embedded compatibility codepoints. Lets agents diff
   * the two forms without re-running with `--no-normalize`.
   */
  rawText?: string;
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
  /**
   * Page width in PDF user-space units (typically PostScript points = 1/72 in).
   * Derived from the page MediaBox via pdf.js `page.view`.
   */
  width: number;
  /** Page height in PDF user-space units. See {@link width}. */
  height: number;
  /**
   * Per-text-item geometry, only present when `geometry: true` was passed.
   * Each entry is a single pdf.js text run with its bbox + font size, in
   * top-down coordinates so callers can overlay them on the rendered PNG.
   */
  spans?: TextSpan[];
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

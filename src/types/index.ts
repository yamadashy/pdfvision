export type OutputFormat = 'markdown' | 'json' | 'xml';

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
  /**
   * Emit a per-page semantic layout in `pages[].layout` — text spans
   * grouped into lines (by y proximity) and lines grouped into blocks
   * (by vertical-gap and font-size similarity). The block array is in
   * approximate reading order (top-down, left-right). Layout is computed
   * from the same span data that powers `--geometry`, so enabling
   * `layout` alone keeps the spans internal and only exposes the
   * higher-level structure.
   */
  layout?: boolean;
  /**
   * Emit per-image bounding boxes in `pages[].imageBoxes`. Lets agents
   * tell apart the page's logo / hero / inline figure / background from
   * each other. Off by default because not every consumer needs them.
   */
  imageBoxes?: boolean;
}

export interface ProcessOptions {
  pages?: string;
  format: OutputFormat;
  noCache: boolean;
  render?: boolean;
  renderOutput?: string;
  normalize?: boolean;
  geometry?: boolean;
  layout?: boolean;
  imageBoxes?: boolean;
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

/**
 * One visual line of text — a group of spans that share a baseline,
 * sorted left-to-right. Built from spans by clustering on the y axis;
 * the bbox is the union of its spans' bboxes.
 */
export interface LayoutLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Most common fontSize across the spans in this line. */
  fontSize: number;
}

/**
 * One semantic block — a group of consecutive lines that look like they
 * belong together (small vertical gap, similar font size). Block bbox is
 * the union of its lines' bboxes; `text` joins the line texts with `\n`.
 */
export interface LayoutBlock {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: LayoutLine[];
  /**
   * Coarse semantic role. `'heading'` when the block's dominant fontSize
   * is meaningfully larger than the page's body text (currently ≥ 1.25×
   * the char-weighted median fontSize). Omitted otherwise — the absence
   * of `role` means body / regular text. Lets agents pick out section
   * anchors without re-deriving fontSize statistics. Caption / list /
   * other roles are not detected today; this field will gain values as
   * heuristics are added rather than be retroactively renamed.
   */
  role?: 'heading';
  /**
   * `true` when this block appears at the same vertical position with the
   * same text on enough other pages to look like a running header, footer,
   * page number, or watermark. Lets agents skip the chrome and focus on
   * the body. Detected post-clustering across the selected page set.
   */
  repeated?: boolean;
}

/**
 * Page-level layout reconstructed from spans. `blocks` is ordered in
 * approximate reading order:
 *   - single-column pages come back top-to-bottom;
 *   - multi-column pages are detected when ≥ 2 narrow x-clusters of blocks
 *     each carry ≥ 2 entries, and reordered so each column reads top-down
 *     before the next column starts (left-to-right);
 *   - blocks wider than ~60% of the page are treated as spanning (e.g.
 *     headings, footers) and stay in their y position, acting as group
 *     separators between column runs.
 * See {@link buildLayout} / `reorderForColumns` in `core/layout.ts` for tuning.
 */
export interface PageLayout {
  blocks: LayoutBlock[];
}

/**
 * Bounding box of one rendered raster image instance on the page.
 * Coordinates use the same top-down origin as `TextSpan`.
 *
 * pdf.js's `paintImage*Repeat` / `paintImage*Group` operators collapse
 * multiple draws of the same XObject into a single op carrying a
 * `positions` array (or per-instance transforms). `buildImageBoxes` in
 * `core/imageBoxes.ts` walks those ops and emits one entry per drawn
 * instance, so a tiled hero surfaces as N per-instance bboxes — and
 * `imageCount === imageBoxes.length` holds for every page. Form XObject
 * (`paintFormXObjectBegin/End`) CTM-stack tracking ensures images drawn
 * inside a Form XObject map to the correct page-space position.
 */
export interface ImageBox {
  x: number;
  y: number;
  width: number;
  height: number;
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
  /**
   * Reconstructed semantic layout, only present when `layout: true` was
   * passed. Blocks are in approximate reading order.
   */
  layout?: PageLayout;
  /**
   * Bounding boxes of raster image draws on the page, only present when
   * `imageBoxes: true` was passed. One entry per draw operation (a tiled
   * hero image yields multiple entries).
   */
  imageBoxes?: ImageBox[];
}

export interface DocumentMetadata {
  title: string | null;
  author: string | null;
  subject: string | null;
  creator: string | null;
}

/**
 * Compact per-page density summary surfaced at the top of the
 * `DocumentResult` so JSON and Markdown consumers can scan outliers
 * (image-flattened slides, blank pages, unusually dense pages) before
 * walking `pages[]` or scrolling the rendered body. Pure aggregation —
 * every field also appears on the corresponding `PageResult`.
 */
export interface PageOverview {
  page: number;
  charCount: number;
  imageCount: number;
  textCoverage: number;
  width: number;
  height: number;
}

export interface DocumentResult {
  file: string;
  totalPages: number;
  metadata: DocumentMetadata;
  /**
   * Top-level density summary across the selected pages. Present when
   * more than one page was extracted; omitted for single-page outputs
   * where a one-row summary is just noise.
   */
  overview?: PageOverview[];
  pages: PageResult[];
}

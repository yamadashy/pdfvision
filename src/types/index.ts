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
  /**
   * Run OCR on each selected page and attach the result as `pages[].ocr`.
   * Off by default — OCR pulls in the optional `tesseract.js` dependency
   * (~30MB worker bundle) and is slow even on small documents. The
   * pdfjs-derived `pages[].text` is left unchanged so callers can diff
   * native text vs OCR (scanned PDFs typically have empty `text` and
   * usable `ocr.text`).
   */
  ocr?: boolean;
  /**
   * Tesseract language code(s), plus-separated (e.g. `eng`, `eng+jpn`).
   * Defaults to `eng`. Only consulted when `ocr` is true.
   */
  ocrLang?: string;
  /**
   * Called once per non-fatal warning produced during extraction (e.g.
   * `--pages` named pages past the end of the document). pdfvision is
   * used both as a library and a CLI; the CLI passes a handler that
   * writes to stderr, library callers can supply their own logger or
   * leave the option unset to silence warnings entirely. Defaults to
   * `undefined` (silent).
   */
  onWarning?: (message: string) => void;
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
  ocr?: boolean;
  ocrLang?: string;
  /**
   * Drop repeated-chrome blocks (running headers, footers, page numbers
   * detected by the cross-page layout pass) from the rendered Markdown
   * body so an LLM doesn't have to read the same footer N times. Has
   * no effect when `format` is anything other than `markdown` — JSON /
   * XML already expose the same information via `repeated: true` on
   * each layout block, so downstream consumers can filter themselves.
   * Requires `layout: true`; the formatter throws otherwise.
   */
  stripRepeated?: boolean;
  /** See {@link ProcessDocumentOptions.onWarning}. */
  onWarning?: (message: string) => void;
}

/**
 * Per-page OCR result. Surfaced only when `--ocr` was requested.
 * `pages[].text` (pdf.js native extraction) is preserved alongside this
 * so callers can compare the two — scanned PDFs typically have empty
 * `text` and a populated `ocr.text`.
 */
export interface PageOcr {
  /** OCR-derived text. Trimmed of trailing whitespace; line breaks preserved. */
  text: string;
  /**
   * Mean tesseract.js confidence over the page, normalised to 0..1
   * (rounded to 3dp). Tesseract reports it as 0..100 internally; we
   * scale down to match the existing `textCoverage` convention.
   */
  confidence: number;
  /** Language string passed in (e.g. `eng`, `eng+jpn`), echoed verbatim. */
  lang: string;
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
   * and surrounding shape look like a section anchor — see {@link level}
   * for the tiered confidence. Omitted otherwise; the absence of `role`
   * means body / regular text or insufficient evidence (not proof the
   * block is semantically non-heading). Caption / list / other roles are
   * not detected today; this field will gain values as heuristics are
   * added rather than be retroactively renamed.
   */
  role?: 'heading';
  /**
   * Approximate heading hierarchy, present only when `role === 'heading'`:
   *   - `1` — major title (fontSize ≥ 1.40× body median).
   *   - `2` — section heading (≥ 1.15× body, or ≥ 1.25× under the legacy
   *           rule). For the 1.15–1.25 band the block must also be short
   *           and either standalone or locally larger than its neighbours.
   *   - `3` — subsection candidate (≥ 1.08× body) — strict gates: short,
   *           single-line, standalone, locally larger than neighbours.
   * Consumers picking a high-precision slice should use `level <= 2`;
   * recall-oriented consumers can include `level === 3`. Title-only
   * extraction is `level === 1`.
   */
  level?: 1 | 2 | 3;
  /**
   * `true` when this block appears at the same vertical position with the
   * same text on enough other pages to look like a running header, footer,
   * page number, or watermark. Lets agents skip the chrome and focus on
   * the body. Detected post-clustering across the selected page set.
   *
   * When a block is flagged `repeated`, any heading classification is
   * dropped — a 2-character language marker that happens to sit at the
   * page-header fontSize was being classified as `level: 1` on every
   * page (eu-ai-act `EN` × 5 pages). The chrome marker wins; agents
   * after `headings` no longer see those duplicates.
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
   * Ratio of non-printable code points to total code points in `text`
   * (0–1, rounded to 3dp). pdf.js falls back to raw glyph indices
   * (U+0000, U+0001, ...) when a font has no ToUnicode CMap, which makes
   * the page look fully covered by `textCoverage` while the actual text
   * is binary garbage. `>= 0.05` is a strong signal that native text
   * is unusable; fall back to `--render` or `--ocr`. Counts NUL, C0
   * (except `\t\n\r`), DEL, C1, unpaired surrogates, and Unicode
   * noncharacters. Private Use Area, format controls, and combining
   * marks are intentionally excluded.
   */
  nonPrintableRatio: number;
  /**
   * Raw count of non-printable code points in `text`. Surfaced alongside
   * the ratio so sparse occurrences (e.g. two stray control bytes inside
   * an arxiv body page) stay discriminable from "zero" — the 3dp
   * `nonPrintableRatio` rounds them down to 0 even though the agent
   * may still want to know "is there ANY garbage?".
   */
  nonPrintableCount: number;
  /**
   * Fraction of pixels in the rasterised page (0–1, rounded to 6dp) that
   * carry visible content — visible alpha (≥ 16 / 255) AND luminance
   * meaningfully different from the page's own dominant background
   * (measured against a 16-bucket luminance histogram so dark / beige /
   * cream pages don't float the ratio). Present only when `--render` or
   * `--ocr` actually rasterised the page; absent when neither caused a
   * raster.
   *
   * Catches a class of silent failure the text-side signals miss: the
   * raster came out blank (or near-blank) even though pdfvision didn't
   * error. Real-world causes include pdf.js + @napi-rs/canvas being
   * unable to decode JPEG2000 / JPX image streams (common in Internet
   * Archive scans) and PDFs whose fonts have no usable ToUnicode CMap
   * (pdf.js can't resolve glyphs and draws nothing). Without this signal
   * the OCR pipeline returns `confidence: 0` and an agent can't tell
   * "OCR saw a blank page" from "OCR genuinely found no text".
   *
   * Rough thresholds (skill doc):
   *   - ≤ 0.001 → effectively blank, likely a render failure
   *   - 0.001 – 0.005 → ambiguous, sparse marks only
   *   - > 0.005 → renderer produced visible content
   */
  renderContentRatio?: number;
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
  /**
   * OCR-derived text + confidence + language, only present when
   * `ocr: true` was passed. The pdfjs-derived `text` field is preserved
   * alongside, so an agent can pick whichever signal it trusts more for
   * the page in question.
   */
  ocr?: PageOcr;
  /**
   * Compact derived classification of the page's text and visual state,
   * computed from the raw signals (`charCount`, `nonPrintableRatio`,
   * `imageCount`, `renderContentRatio`) so agents can dispatch on a
   * single field instead of re-implementing the threshold logic. Pure
   * observation — pdfvision deliberately does NOT recommend an action
   * (e.g. "rerun with --ocr"); that judgment stays with the agent.
   *
   * See {@link PageQuality} for the field semantics and the exact
   * derivation rules.
   */
  quality: PageQuality;
}

/**
 * Derived page-quality classification. The values are observational —
 * they tell the agent what pdfvision saw, not what the agent should do
 * about it.
 */
export interface PageQuality {
  /**
   * Native-text extraction outcome:
   *   - `ok` — the page has usable native text (`charCount > 0` and
   *     `nonPrintableRatio < 0.05`).
   *   - `unusable_glyph_indices` — `nonPrintableRatio >= 0.05`. pdf.js
   *     returned raw glyph codes (no usable ToUnicode CMap), so `text`
   *     is binary garbage even though `charCount` may look healthy.
   *   - `empty_but_visual_content` — `charCount === 0` AND the page has
   *     visual content (`imageCount > 0`, or `renderContentRatio` is
   *     above the blank threshold when --render/--ocr ran). Typical of
   *     image-flattened slides and scans.
   *   - `empty` — `charCount === 0` and no visual content detected.
   *     Likely a genuinely blank page or a render failure (combine with
   *     `visualStatus` to disambiguate).
   */
  nativeTextStatus: 'ok' | 'unusable_glyph_indices' | 'empty_but_visual_content' | 'empty';
  /**
   * Rasterisation outcome, present only when `--render` or `--ocr`
   * actually rasterised the page:
   *   - `ok` — `renderContentRatio > 0.001`. The renderer drew
   *     meaningful content.
   *   - `blank` — `renderContentRatio <= 0.001`. The page came out
   *     effectively blank against its own dominant background;
   *     typically a render-pipeline failure (unsupported image format,
   *     missing fonts) or a genuinely blank page.
   * Absent when neither `--render` nor `--ocr` triggered a raster.
   */
  visualStatus?: 'ok' | 'blank';
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
  /**
   * Same field as on {@link PageResult.nonPrintableRatio}. Mirrored on
   * the overview so agents can spot CMap-garbage pages (text looks
   * full but is binary) from the top-level summary without scanning
   * `pages[]`.
   */
  nonPrintableRatio: number;
  /** Raw count companion to {@link nonPrintableRatio}; see PageResult. */
  nonPrintableCount: number;
  /**
   * Same field as {@link PageResult.renderContentRatio} — mirrored on the
   * overview so an agent can spot blank-rendered pages from the top-level
   * summary without scanning `pages[]`. Present only when `--render` or
   * `--ocr` triggered a raster on at least the corresponding page.
   */
  renderContentRatio?: number;
  /**
   * Mirror of {@link PageResult.quality} so the overview can flag
   * unusable / blank pages at a glance without descending into
   * `pages[]`.
   */
  quality: PageQuality;
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

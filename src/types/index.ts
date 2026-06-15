export type OutputFormat = 'markdown' | 'json' | 'xml' | 'toon';

/**
 * Sub-rectangle of a page to rasterise. PDF user-space points with the
 * top-down origin pdfvision uses for `spans`, `layout.blocks`, and
 * `imageBoxes` — `(0, 0)` is the page's top-left, `y` grows downward.
 * width / height must be positive; bounds and single-page checks live
 * in the processor so this stays a pure shape type.
 */
export interface RenderRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Options for the structured `processDocument()` API.
 * Independent of formatting concerns: format / pretty-printing / etc. are
 * the caller's responsibility once they have the structured result.
 */
export interface ProcessDocumentOptions {
  /** Pages selector, e.g. "1-5", "3", "1,3,5". Omitted = all pages. */
  pages?: string;
  /**
   * In-memory PDF bytes. When provided, pdfvision parses these bytes
   * instead of reading `filePath` from disk; `filePath` remains a label
   * in the returned `DocumentResult.file`. Used by `--remote` so the
   * extractor is isolated from remote-cache cleanup after download.
   */
  sourceData?: Uint8Array;
  /**
   * Password for encrypted PDFs. Omit for unencrypted PDFs; pass the
   * document user password when pdf.js reports that a password is required.
   */
  password?: string;
  /** Render each selected page to PNG and include the path in `pages[].image`. */
  render?: boolean;
  /** Skip the on-disk cache, always re-extract. Defaults to `false`. */
  noCache?: boolean;
  /**
   * Directory to write rendered PNGs into. Used when `render` or
   * `renderVisualRegions` is true. If unset, pdfvision picks a path under
   * the cache (or OS tmp) directory. The directory is created if it
   * doesn't already exist.
   */
  renderOutput?: string;
  /**
   * Multiplier applied to the PDF's intrinsic page size when rasterising
   * (`--render`, `--render-visual-regions`, and `--ocr`). `2` (the default)
   * renders a 612×792 letter page at 1224×1584 — readable by vision models
   * without losing detail.
   * Smaller values trade fidelity for payload size (a 1.0× page is roughly
   * a quarter the bytes of the 2.0× default and is sufficient for most
   * agentic-vision dispatch tasks). Values outside (0, 4] throw — 4× is
   * 16× the pixel count and a soft ceiling against accidental OOM.
   *
   * Affects rendered page PNGs, visual-region crop PNGs, and their
   * `renderContentRatio` measurements (the same raster is what the ratio
   * scan runs on). Different scales cache separately and write to distinct
   * directories so back-to-back runs at different scales don't clobber
   * each other.
   */
  renderScale?: number;
  /**
   * Sub-rectangle of the page to rasterise instead of the full page,
   * specified in PDF points (top-left origin, y grows downward — same
   * coordinate system as `pages[].spans`, `layout.blocks`, and
   * `imageBoxes`). Composes orthogonally with `renderScale`: a 400×300pt
   * region at scale 3 yields a 1200×900px PNG.
   *
   * Typical agent flow: run with `--layout`, pick a suspicious block from
   * `warnings[]` / `layout.blocks[blockIndex]`, then re-run with that
   * block's bbox here to get just that region as a high-detail PNG.
   *
   * V1 is strictly single-page: passing a `pages` selector that resolves
   * to anything other than exactly one page throws. The use case is
   * "zoom into THIS region of THIS page"; multi-page region semantics
   * (varying page sizes, off-page on shorter pages) are not modelled.
   *
   * Throws if the region falls outside the page bounds (no silent clip)
   * or if `width` / `height` are not positive. Goes through the cache key
   * and the on-disk PNG filename so multiple regions per page coexist.
   */
  renderRegion?: RenderRegion;
  /**
   * Find every occurrence of the given query (or queries) on each page
   * and attach `pages[].matches[]` with the bbox of each hit. Pipe a
   * match's bbox straight into a follow-up `renderRegion` call to get
   * a PNG zoomed onto the match.
   *
   * Accepts a single string or an array (repeatable `--search` on the
   * CLI). Each emitted match carries `query` (the source string) and,
   * for multi-query searches, `queryIndex` (0-based into the array)
   * so consumers can demultiplex.
   *
   * Default semantics:
   *   - **literal substring** (regex special characters are matched
   *     verbatim); set {@link searchRegex} to `true` to treat the query
   *     as a JavaScript regular expression
   *   - **case-insensitive** (Unicode-aware via String.toLowerCase);
   *     set {@link searchCaseSensitive} for exact-case matching
   *   - **NFKC-aware in literal mode** when {@link normalize} is on
   *     (the default) — the literal query and the page text are both
   *     normalised before matching, so `"fi"` finds `"ﬁ"` (U+FB01
   *     ligature) PDFs that external grep would miss; same fold
   *     applies to fullwidth Latin / CJK compatibility forms.
   *     {@link searchRegex} queries are NOT normalised (NFKC can turn
   *     compatibility punctuation into regex metacharacters, silently
   *     overmatching or breaking the pattern); regex users get the
   *     literal codepoints they typed against the normalised document
   *     text and own the asymmetry.
   *
   * Internally enables span extraction so per-match bboxes are
   * available; the public `pages[].spans` still requires `geometry`,
   * and the public `pages[].layout` still requires `layout`. Form field
   * text/choice values and visible FreeText annotation contents are
   * searched too, even when `formFields` / `annotations` were not
   * requested for output; those hits use the widget/annotation bbox and
   * carry `source: 'formField'` / `source: 'annotation'`. OCR text is
   * also searched when {@link ocr} is on — those matches come back with
   * `source: 'ocr'` and use OCR word boxes when available, with a
   * page-level bbox fallback when OCR output lacks word layout or
   * word-level reconstruction misses a query that exists in full
   * `ocr.text`.
   */
  search?: string | string[];
  /** Treat each {@link search} query as a JavaScript regular expression
   *  instead of a literal substring. Off by default — regex-default
   *  surprises agents feeding raw user input that happens to contain
   *  `(`, `[`, `?`, etc.
   *
   *  **ReDoS caveat**: pdfvision compiles the user pattern straight to
   *  a JavaScript RegExp and runs `.exec(...)` over every span/OCR
   *  haystack. A catastrophic-backtracking pattern (`(a+)+b` against
   *  `"aaa...!"`) can stall extraction on a single string. There is a
   *  per-page, per-query, per-source emission cap (10,000 matches)
   *  that brakes degenerate patterns producing too many hits, surfaced
   *  via `onWarning` when the cap is reached — but the cap counts
   *  emissions, not exec time, so it cannot interrupt an in-flight
   *  exponential match. Library consumers exposing pdfvision to
   *  untrusted regex input should wrap the call in their own timeout
   *  (e.g. via `worker_threads` or `AbortSignal.timeout`). The
   *  threat model assumed here is "user matching against their own
   *  input" — a heavy mitigation (safe-regex dep, RE2 backend) would
   *  cost more than it's worth for that use. */
  searchRegex?: boolean;
  /** Match case exactly. Off by default — recall-oriented agents
   *  typically want `"Sales"` / `"sales"` / `"SALES"` matches
   *  regardless of the source PDF's casing. */
  searchCaseSensitive?: boolean;
  /**
   * Apply Unicode NFKC normalization to extracted text and metadata strings.
   * Defaults to `true`. PDFs (especially Japanese ones produced by Office /
   * iWork) frequently embed compatibility codepoints like `⽬` (U+2F6C) in
   * place of `目` (U+76EE), which silently break grep / diff / structured
   * extraction downstream. NFKC also folds fullwidth punctuation (`（` → `(`),
   * ligatures (`ﬁ` → `fi`), and halfwidth/fullwidth digit variants.
   *
   * When the normalization actually changes the page text, the
   * pre-normalization form is preserved on `pages[].rawText` (json / xml
   * outputs) so callers can diff the two without re-running with
   * `normalize: false`. Markdown output only renders the normalized form
   * — pass `normalize: false` if original codepoint fidelity matters for
   * downstream diff / forensics / glyph-level audit.
   *
   * Pass `false` if you specifically need the raw code points emitted by
   * pdf.js (e.g. a forensic tool inspecting how the PDF was authored).
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
   * grouped into lines and blocks, plus conservative row-major table
   * hints for aligned numeric tables. The block array is in approximate
   * reading order (top-down, left-right). Layout is computed from the
   * same span data that powers `--geometry`, so enabling `layout` alone
   * keeps the spans internal and only exposes the higher-level structure.
   */
  layout?: boolean;
  /**
   * Emit per-image bounding boxes in `pages[].imageBoxes`. Lets agents
   * tell apart the page's logo / hero / inline figure / background from
   * each other. Off by default because not every consumer needs them.
   */
  imageBoxes?: boolean;
  /**
   * Emit bounding boxes for painted vector paths and clipped shading fills
   * in `pages[].vectorBoxes`. Useful for maps, diagrams, chart paths,
   * gradient panels, table rules, slide shapes, and other non-raster visual
   * marks that are visible to humans but absent from native text.
   */
  vectorBoxes?: boolean;
  /**
   * Emit crop-ready visual regions in `pages[].visualRegions`. These
   * regions group existing image/vector/table/form geometry into larger
   * human-meaningful areas so agents can choose `renderRegion` crops
   * without manually clustering raw drawing operations.
   */
  visualRegions?: boolean;
  /**
   * Render each emitted visual region to a cropped PNG and attach the
   * path plus render-content ratio on `pages[].visualRegions[].image`.
   * Implies {@link visualRegions}; it does not require full-page
   * `render`, so agents can get only the suggested crops.
   */
  renderVisualRegions?: boolean;
  /**
   * Emit interactive PDF form/widget fields in `pages[].formFields`.
   * Useful for government forms and applications where blank text boxes,
   * checkboxes, radio buttons, buttons, signatures, choice fields, export
   * values, and widget actions are part of the human-visible document even
   * when native text extraction succeeds.
   */
  formFields?: boolean;
  /**
   * Emit clickable PDF link annotations in `pages[].links`. Useful for
   * papers, reports, and manuals where citation jumps, table-of-contents
   * entries, and external URLs are part of how a human navigates the PDF.
   */
  links?: boolean;
  /**
   * Emit non-link, non-widget PDF annotations in `pages[].annotations`.
   * Useful for comments, sticky notes, highlights, underlines, strikeouts,
   * stamps, file-attachment icons, shape markup, ink paths, and other
   * annotation markup a human PDF reader can see.
   */
  annotations?: boolean;
  /**
   * Emit tagged-PDF structure trees in `pages[].structure`. Useful for
   * accessible PDFs whose viewer/accessibility layer contains roles,
   * figure alt text, language hints, or structural grouping that native
   * text and visual layout alone do not reveal.
   */
  structure?: boolean;
  /**
   * Emit viewer page labels in `pageLabels` and `pages[].pageLabel`.
   * Useful when the PDF viewer shows roman front matter, section prefixes,
   * or restarted numbering that differs from the physical page number.
   */
  pageLabels?: boolean;
  /**
   * Emit document-level embedded file attachment metadata in `attachments`.
   * Useful for PDFs whose viewer attachment pane exposes supplemental files.
   * The attachment bytes are not embedded in the structured output.
   */
  attachments?: boolean;
  /**
   * Directory for writing embedded attachment files. Requires
   * `attachments: true`. Files are written under a per-PDF fingerprint
   * subdirectory and `attachments[].path` points at the saved file.
   */
  attachmentOutput?: string;
  /**
   * Emit the document outline / bookmarks in `outline`. Useful for long
   * reports, manuals, and papers where a human PDF viewer exposes section
   * navigation in the sidebar. Named destinations are resolved to page
   * numbers when pdf.js can map them.
   */
  outline?: boolean;
  /**
   * Emit viewer-level document settings in `viewer`, including initial page
   * mode/layout, viewer preferences, open action, JavaScript actions,
   * page-level JavaScript actions, permissions, and MarkInfo.
   * Useful when the way a human PDF viewer opens or navigates the document is
   * itself part of the reading context.
   */
  viewer?: boolean;
  /**
   * Emit PDF optional content groups (viewer "layers") in `layers`. Useful for
   * CAD drawings, maps, design files, and multilingual/variant documents where
   * a human can toggle visible content in a layers panel.
   */
  layers?: boolean;
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
  /** See {@link ProcessDocumentOptions.sourceData}. */
  sourceData?: Uint8Array;
  /** See {@link ProcessDocumentOptions.password}. */
  password?: string;
  format: OutputFormat;
  noCache: boolean;
  render?: boolean;
  renderOutput?: string;
  /** See {@link ProcessDocumentOptions.renderScale}. */
  renderScale?: number;
  /** See {@link ProcessDocumentOptions.renderRegion}. */
  renderRegion?: RenderRegion;
  /** See {@link ProcessDocumentOptions.search}. */
  search?: string | string[];
  /** See {@link ProcessDocumentOptions.searchRegex}. */
  searchRegex?: boolean;
  /** See {@link ProcessDocumentOptions.searchCaseSensitive}. */
  searchCaseSensitive?: boolean;
  normalize?: boolean;
  geometry?: boolean;
  layout?: boolean;
  imageBoxes?: boolean;
  /** See {@link ProcessDocumentOptions.vectorBoxes}. */
  vectorBoxes?: boolean;
  /** See {@link ProcessDocumentOptions.visualRegions}. */
  visualRegions?: boolean;
  /** See {@link ProcessDocumentOptions.renderVisualRegions}. */
  renderVisualRegions?: boolean;
  /** See {@link ProcessDocumentOptions.formFields}. */
  formFields?: boolean;
  /** See {@link ProcessDocumentOptions.links}. */
  links?: boolean;
  /** See {@link ProcessDocumentOptions.annotations}. */
  annotations?: boolean;
  /** See {@link ProcessDocumentOptions.structure}. */
  structure?: boolean;
  /** See {@link ProcessDocumentOptions.pageLabels}. */
  pageLabels?: boolean;
  /** See {@link ProcessDocumentOptions.attachments}. */
  attachments?: boolean;
  /** See {@link ProcessDocumentOptions.attachmentOutput}. */
  attachmentOutput?: string;
  /** See {@link ProcessDocumentOptions.outline}. */
  outline?: boolean;
  /** See {@link ProcessDocumentOptions.viewer}. */
  viewer?: boolean;
  /** See {@link ProcessDocumentOptions.layers}. */
  layers?: boolean;
  ocr?: boolean;
  ocrLang?: string;
  /**
   * Drop repeated-chrome blocks (running headers, footers, page numbers
   * detected by the cross-page layout pass) from the rendered Markdown
   * body so an LLM doesn't have to read the same footer N times.
   *
   * Only applies when `format` is `'markdown'`. Passing it with `'json'`
   * or `'xml'` throws — those formats already expose `repeated: true`
   * on each layout block, so downstream consumers can filter themselves
   * and a silent no-op there would be a footgun.
   *
   * Requires `layout: true` (the `repeated` flag is only set during the
   * cross-page layout pass); throws otherwise.
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
  /**
   * OCR word boxes in page coordinates, present when tesseract.js returns
   * block/line/word layout. Useful for precise search hits on scanned pages.
   */
  words?: OcrWord[];
}

export interface OcrWord {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
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
 * One visual line of text — a group of spans that share a baseline.
 * Text is reconstructed in the detected script direction for the line;
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
  /**
   * Visual writing direction for this reconstructed line. Omitted for the
   * default horizontal case to keep JSON compact; `vertical` marks CJK
   * glyph stacks that are meant to be read top-to-bottom.
   */
  writingMode?: 'vertical';
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
   * Visual writing direction for this reconstructed block. Omitted for
   * horizontal text; `vertical` means the block text was assembled from a
   * top-to-bottom CJK glyph stack rather than left-to-right baselines.
   */
  writingMode?: 'vertical';
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
   *   - `1` — major title (fontSize ≥ 1.40× body median, or a
   *           top-of-page document title in the 1.25× band).
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
   * Heuristic confidence in the `role: 'heading'` classification on a
   * 0–1 scale (rounded to 2dp). Present only when `role === 'heading'`.
   *
   * The classifier is feature-based (font-size ratio, isShort, standalone,
   * locally-larger-than-neighbours), not statistical — `roleConfidence`
   * exposes how many of those features lined up rather than a calibrated
   * probability. Useful when an agent needs to threshold (e.g. only treat
   * `>= 0.7` as a section anchor) instead of relying on the discrete
   * `level` tier. The two fields are correlated by construction —
   * higher levels imply higher confidence — but the threshold value is
   * the agent's call.
   *
   * Rough bands (subject to tuning; do NOT hard-code exact values):
   *   - `>= 0.85` — clear title / top-of-section heading (level 1, or
   *     level 2 with every structural gate passing).
   *   - `0.60–0.85` — solid section heading with most gates passing.
   *   - `< 0.60` — recall-oriented level-3 subsection candidates.
   */
  roleConfidence?: number;
  /**
   * `true` when this block appears at the same vertical position with the
   * same text on enough other pages to look like a running header, footer,
   * page number, or watermark. Lets agents skip the chrome and focus on
   * the body. Detected post-clustering across the selected page set.
   * If only one line in a multi-line edge block is repeated chrome, pdfvision
   * can split that line into its own repeated block so adjacent body text
   * remains usable.
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
  /**
   * Row-major table hints reconstructed from aligned layout lines. Present
   * only when pdfvision finds repeated rows with multiple numeric cells.
   * This is deliberately a hint, not a full PDF table model: merged cells
   * and multi-line headers can still require visual confirmation, but
   * detached currency symbols are folded into the following numeric cell
   * when their row position makes the relationship clear.
   */
  tables?: LayoutTable[];
}

export interface LayoutTable {
  x: number;
  y: number;
  width: number;
  height: number;
  rowCount: number;
  columnCount: number;
  rows: LayoutTableRow[];
}

export interface LayoutTableRow {
  y: number;
  height: number;
  cells: LayoutTableCell[];
}

export interface LayoutTableCell {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Bounding box of one rendered raster image instance on the page.
 * Coordinates use the same top-down origin as `TextSpan`.
 *
 * pdf.js's `paintImage*Repeat` / `paintImage*Group` operators collapse
 * multiple draws of the same XObject into a single op carrying a
 * `positions` array (or per-instance transforms). `buildImageBoxes` in
 * `core/imageBoxes.ts` walks those ops and emits one entry per drawn
 * instance, so a tiled hero surfaces as N per-instance bboxes. Image-
 * bearing tiling patterns painted through fill paths surface as the
 * painted path bbox so masked/pattern images still become crop targets.
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

export interface VectorBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type VisualRegionKind = 'raster' | 'vector' | 'table' | 'form' | 'annotation' | 'mixed';
export type VisualRegionSourceType = 'imageBox' | 'vectorBox' | 'layoutTable' | 'formField' | 'annotation';
export type VisualRegionAssociatedTextRelation = 'caption' | 'label';

export interface VisualRegionSource {
  /** Source geometry collection this region was derived from. */
  type: VisualRegionSourceType;
  /** 0-based index into the source collection on the same page; the collection may be internal if not emitted. */
  index: number;
}

export interface VisualRegionAssociatedText {
  text: string;
  relation: VisualRegionAssociatedTextRelation;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0-based index into `layout.blocks` when the text came from page layout. */
  blockIndex?: number;
  /** 0-based index into `formFields` when the label came from a form field. */
  fieldIndex?: number;
}

/**
 * Human-meaningful visual region that can be passed directly to
 * `--render-region x,y,width,height` for a high-detail crop. Regions are
 * derived from existing page geometry (raster image boxes, vector path
 * clusters, layout table hints, form widgets, and visible annotation
 * markup), padded and clamped to page bounds.
 */
export interface VisualRegion {
  /** Stable page-local identifier such as `p3-vr0`, present in extracted page results. */
  id?: string;
  kind: VisualRegionKind;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Region area divided by page area, rounded to 3 decimals. */
  areaRatio: number;
  /** Total number of source geometry items represented by this region. */
  sourceCount: number;
  /** Representative source refs; large vector clusters are intentionally capped. */
  sources: VisualRegionSource[];
  /** Short human-readable reason for why the region is worth inspecting. */
  reason: string;
  /** Nearby or in-region text that identifies this visual region, such as a caption, form label, chart title, or table lead-in. */
  associatedText?: VisualRegionAssociatedText[];
  /** Cropped PNG path for this region when `renderVisualRegions` was requested. */
  image?: string;
  /** Content ratio measured from the cropped region PNG when rendered. */
  renderContentRatio?: number;
}

export type FormFieldType = 'text' | 'checkbox' | 'radio' | 'choice' | 'signature' | 'button' | 'unknown';
export type FormFieldLabelRelation = 'left' | 'right' | 'above' | 'below';

export interface FormFieldLabel {
  text: string;
  relation: FormFieldLabelRelation;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FormFieldChoiceOption {
  /** Value submitted/exported by the PDF form. */
  exportValue: string;
  /** Human-visible choice label shown by a PDF viewer. */
  displayValue: string;
}

export interface FormFieldResetFormAction {
  /** Field names listed by the PDF ResetForm action. */
  fields: string[];
  /** True means reset only listed fields; false means reset every field except the listed fields. */
  include: boolean;
}

export interface FormField {
  name: string;
  type: FormFieldType;
  x: number;
  y: number;
  width: number;
  height: number;
  value?: string;
  checked?: boolean;
  readOnly?: boolean;
  required?: boolean;
  multiline?: boolean;
  /** Submitted/exported value for checkbox/radio button widgets when pdf.js exposes it. */
  exportValue?: string;
  /** Choice-field options, present when pdf.js exposes combo/list box entries. */
  options?: FormFieldChoiceOption[];
  /** True for combo boxes, false for list boxes. Present for choice fields when pdf.js exposes it. */
  combo?: boolean;
  /** True when a choice field allows selecting multiple options. */
  multiSelect?: boolean;
  /** Decoded PDF widget annotation flags, such as hidden, print, noView, or locked. */
  flags?: PageAnnotationFlag[];
  /** Widget-level JavaScript actions such as button click scripts. */
  actions?: Record<string, string[]>;
  /** Non-JavaScript ResetForm button action when pdf.js exposes it. */
  resetForm?: FormFieldResetFormAction;
  /**
   * Nearby visible text that likely labels this field, reconstructed from
   * layout lines when `--form-fields` is enabled. Stacked above/below label
   * lines and left-side checkbox/radio continuation lines can be merged into
   * one visible prompt. This helps agents map anonymous AcroForm names such
   * as `f1_01[0]` or checkbox arrays to the human-readable prompt a person
   * sees next to or above the widget.
   */
  label?: FormFieldLabel;
}

export type PageLinkType = 'url' | 'destination';
export type PageLinkTarget = string | unknown[];

export interface PageLink {
  /**
   * `url` for external links, `destination` for named/internal PDF
   * destinations such as citation jumps or table-of-contents anchors.
   */
  type: PageLinkType;
  /** URL, destination name, or raw destination array when pdf.js exposes one. */
  target: PageLinkTarget;
  /** 1-based physical destination page for internal PDF links when it can be resolved. */
  page?: number;
  /** Visible text inside the link rectangle when it can be reconstructed from native text. */
  text?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DocumentOutlineTargetType = 'destination' | 'url' | 'action';

export interface DocumentOutlineItem {
  title: string;
  /**
   * `url` for external outline links, `destination` for named/internal PDF
   * destinations, or `action` for named PDF viewer actions such as NextPage.
   * Omitted when an outline node is only a parent label.
   */
  type?: DocumentOutlineTargetType;
  /** URL, action name, or destination identifier / explicit-destination JSON string. */
  target?: string;
  /** 1-based page number resolved from `target` when pdf.js can map it. */
  page?: number;
  /** Nested outline children, preserving the PDF sidebar hierarchy. */
  items?: DocumentOutlineItem[];
}

export type DocumentPermission =
  | 'print'
  | 'modifyContents'
  | 'copy'
  | 'modifyAnnotations'
  | 'fillInteractiveForms'
  | 'copyForAccessibility'
  | 'assemble'
  | 'printHighQuality';

export interface DocumentPermissions {
  /** Raw PDF permission flag values returned by pdf.js. */
  flags: number[];
  /** Human-readable allowed permissions decoded from `flags`. */
  allowed: DocumentPermission[];
}

export type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };

export interface DocumentOpenAction {
  type: 'destination' | 'action';
  /** Destination name or explicit-destination JSON when `type` is `destination`. */
  target?: string;
  /** 1-based page number when a PDF destination could be resolved. */
  page?: number;
  /** PDF action name when the open action is not a plain destination. */
  action?: string;
}

export interface DocumentMarkInfo {
  marked: boolean;
  userProperties: boolean;
  suspects: boolean;
}

export interface DocumentViewerState {
  /** Initial page layout requested by the PDF catalog, e.g. `TwoColumnLeft`. */
  pageLayout?: string;
  /** Initial page mode requested by the PDF catalog, e.g. `UseOutlines`. */
  pageMode?: string;
  /** Viewer preferences such as DisplayDocTitle, Direction, or PrintScaling. */
  viewerPreferences?: Record<string, JsonValue>;
  /** Catalog OpenAction resolved to a page when possible. */
  openAction?: DocumentOpenAction;
  /** Document-level JavaScript actions such as auto-print scripts. */
  jsActions?: Record<string, string[]>;
  /** Document permission flags when the PDF defines them. */
  permissions?: DocumentPermissions;
  /** Tagged-PDF MarkInfo flags when present. */
  markInfo?: DocumentMarkInfo;
}

export interface DocumentLayerUsage {
  viewState?: 'ON' | 'OFF';
  printState?: 'ON' | 'OFF';
}

export interface DocumentLayerGroup {
  /** PDF optional-content group id, e.g. `4R`. */
  id: string;
  /** Layer name shown by PDF viewers when present. */
  name?: string;
  /** Visibility for the display intent after the default config is applied. */
  visible: boolean;
  /** OCG intent names such as `View` or `Design`. */
  intent?: string[];
  /** View/print usage states when the PDF defines them. */
  usage?: DocumentLayerUsage;
  /** Radio-button group ids that make this layer mutually exclusive. */
  rbGroups?: string[][];
}

export type DocumentLayerOrderItem = string | { name?: string; order: DocumentLayerOrderItem[] };

export interface DocumentLayers {
  /** Optional-content configuration name. */
  name?: string;
  /** Optional-content configuration creator. */
  creator?: string;
  /** Layer panel order, including nested groups, when provided. */
  order?: DocumentLayerOrderItem[];
  /** All optional-content groups known to the document. */
  groups: DocumentLayerGroup[];
}

export interface DocumentAttachment {
  /** Decoded attachment filename shown by a PDF viewer. */
  name: string;
  /** Raw PDF attachment filename when it differs from the decoded name. */
  rawName?: string;
  /** Optional attachment description from the PDF file specification. */
  description?: string;
  /** Embedded file byte length. Attachment bytes are intentionally not emitted. */
  size: number;
  /** Saved attachment path, present when `attachmentOutput` was provided. */
  path?: string;
}

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
  /** Optional bbox emitted by pdf.js for structure nodes that carry one. */
  bbox?: number[];
  /** Nested structure nodes or marked-content/object references. */
  children: PageStructureItem[];
}

export interface PageResult {
  page: number;
  /**
   * Viewer-visible page label for this page, only present when
   * `pageLabels: true` was passed and the PDF defines page labels.
   * Examples: `i`, `ii`, `A-1`, or `1`. This can differ from the
   * physical `page` number used by the CLI page selector.
   */
  pageLabel?: string;
  /**
   * Rendered region echoed back when `renderRegion` was passed to the
   * extraction call. Lets consumers tell whether `pages[].image` is the
   * full page or a sub-rectangle without having to track the original
   * request. Coordinates are in PDF points (top-left origin), matching
   * the input. Omitted for full-page renders.
   */
  renderRegion?: RenderRegion;
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
   * Number of vector drawing operations on the page (path construction,
   * filled / stroked paths, and shadings). Raster images are counted
   * separately in {@link imageCount}; this signal catches diagrams,
   * form boxes, slide shapes, rules, and charts that a human can see but a
   * text-only / raster-image-only pass would otherwise miss.
   *
   * The value is a count of paint operations, not geometry area. Treat it
   * as a "there is non-text visual structure here" signal; agents that
   * need visual fidelity should pair it with `--render`.
   */
  vectorCount: number;
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
   * is partly or mostly binary garbage. `>= 0.05` means native text is
   * incomplete or risky; `>= 0.3` means it is mostly unusable. Fall back
   * to `--render` or `--ocr` when this appears. Counts NUL, C0 (except
   * `\t\n\r`), DEL, C1, unpaired surrogates, and Unicode noncharacters.
   * Private Use Area, format controls, and combining marks are
   * intentionally excluded. PUA-dominant pages can still surface through
   * `warnings[].code === 'glyph_garbage_text'` because icon fonts may use
   * sparse PUA glyphs legitimately.
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
   *   - ≤ 0.001 → effectively blank unless corroborated object geometry
   *     or visible annotation appearance shows a tiny visible trace
   *   - 0.001 – 0.005, or a corroborated tiny trace below 0.001 →
   *     sparse marks only
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
   * passed. Blocks are in approximate reading order; `tables[]` adds
   * row-major hints for aligned numeric tables when detected.
   */
  layout?: PageLayout;
  /**
   * Bounding boxes of raster image draws on the page, only present when
   * `imageBoxes: true` was passed. One entry per draw operation (a tiled
   * hero image yields multiple entries); image-bearing tiling pattern
   * fills use the painted path bbox.
   */
  imageBoxes?: ImageBox[];
  /**
   * Bounding boxes of vector drawings on the page, only present when
   * `vectorBoxes: true` was passed. One entry per path paint operation
   * where pdf.js reports a path bbox, plus shading fills when pdf.js
   * exposes the active clipping bbox, excluding page-sized white
   * background fills. Coordinates use the same top-left PDF-point system
   * as `spans`, `layout.blocks`, and `imageBoxes`.
   */
  vectorBoxes?: VectorBox[];
  /**
   * Crop-ready visual regions, only present when `visualRegions: true`
   * was passed. These are padded/clamped PDF-point bboxes intended for
   * direct use with `renderRegion` when an agent needs to inspect the
   * figure, chart, diagram, table, or form area visually.
   */
  visualRegions?: VisualRegion[];
  /**
   * Interactive PDF form/widget fields, only present when
   * `formFields: true` was passed. Coordinates use the same top-left
   * PDF-point system as `spans`, `layout.blocks`, and `imageBoxes`.
   */
  formFields?: FormField[];
  /**
   * Clickable PDF link annotations, only present when `links: true` was
   * passed. Coordinates use the same top-left PDF-point system as
   * `spans`, `layout.blocks`, and `imageBoxes`.
   */
  links?: PageLink[];
  /**
   * Non-link, non-widget PDF annotations, only present when
   * `annotations: true` was passed. Coordinates use the same top-left
   * PDF-point system as `spans`, `layout.blocks`, and `imageBoxes`.
   */
  annotations?: PageAnnotation[];
  /**
   * Tagged-PDF structure tree for this page, present when `structure: true`
   * was passed. `null` means the pass ran and pdf.js found no page
   * structure tree; absent means structure extraction was not requested.
   */
  structure?: PageStructureNode | null;
  /**
   * Page-level JavaScript actions such as PageOpen/PageClose scripts, present
   * when `viewer: true` was passed and the page defines them.
   */
  jsActions?: Record<string, string[]>;
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
  /**
   * Hits for {@link ProcessDocumentOptions.search} queries on this page,
   * one entry per occurrence. Present only when `search` was passed.
   * Empty array is preserved (distinguishes "search ran, no hits" from
   * "search wasn't requested") so consumers can iterate `pages[].matches`
   * uniformly.
   */
  matches?: SearchMatch[];
  /**
   * Page anomalies detected from layout geometry, text-quality signals,
   * or image boxes. Layout-specific warnings require `layout: true`;
   * image-region warnings can use internal image boxes even when
   * `imageBoxes` is false, while `imageBoxIndex` is only emitted when
   * public `pages[].imageBoxes` exists. Localized glyph noise and
   * PUA-dominant glyph-code text can surface from always-on text-quality
   * signals such as non-printable counters, private-use glyph counts/ratios,
   * isolated mojibake in CJK text, Latin-1 printable mojibake, pdf.js
   * font character-map warnings, or high-confidence OCR/native text
   * disagreement. Empty array is omitted; a populated array means at
   * least one rule fired.
   *
   * Same observational stance as {@link PageQuality}: the warning
   * describes what pdfvision saw, not what the agent should do. See
   * {@link PageWarning} for the field semantics and the rule catalog.
   */
  warnings?: PageWarning[];
}

/**
 * One occurrence of a {@link ProcessDocumentOptions.search} query on a
 * page. Emitted per match, not per page — so the same query found
 * three times on page 5 yields three SearchMatch entries with `page: 5`.
 *
 * The bbox is in PDF points (top-left origin, y grows downward —
 * matching {@link TextSpan} / {@link LayoutBlock} / {@link ImageBox}),
 * so an agent can pipe it directly into a follow-up `renderRegion`
 * call to get a PNG zoomed onto the match.
 */
export interface SearchMatch {
  /** 1-based page number the match was found on. Mirrored on the
   *  parent `PageResult.page` for convenience — so a match plucked out
   *  of a flat `pages.flatMap(p => p.matches ?? [])` still knows where
   *  it came from. */
  page: number;
  /** The query string that produced this match (verbatim, before NFKC
   *  normalization). Useful when the search ran with multiple queries
   *  and the consumer wants to filter / group by source query. */
  query: string;
  /** 0-based index into the `search` array when more than one query
   *  was passed. Omitted when search was a single string — keeps the
   *  common case un-noisy. */
  queryIndex?: number;
  /** Union bbox covering every contributing span. Suitable for
   *  `renderRegion` zoom. */
  bbox: { x: number; y: number; width: number; height: number };
  /** Per-span bboxes that contribute to the match. Single-span matches
   *  have one box; phrase matches crossing pdf.js span boundaries carry
   *  multiple boxes and a union `bbox`. Lets callers draw precise
   *  highlight overlays or split multi-span matches. */
  boxes: { x: number; y: number; width: number; height: number }[];
  /** The matched substring in the same form as `pages[].text` — NFKC-
   *  normalized when `normalize` is on (the default), raw codepoints
   *  when `--no-normalize` was passed. For OCR-source matches this is
   *  the OCR-derived text. Agents wanting both forms can extract from
   *  the surrounding `pages[].text` / `pages[].rawText` pair using the
   *  bbox offsets — V1 doesn't dual-emit per match. */
  text: string;
  /** Where the match came from. `'native'` = pdf.js text stream
   *  (precise bbox via spans). `'formField'` = a text/choice widget
   *  value (widget bbox). `'annotation'` = visible FreeText annotation
   *  contents (annotation bbox). `'ocr'` = `pages[].ocr.text`
   *  (word-level bbox when `pages[].ocr.words` exists and matches,
   *  otherwise page-level fallback). */
  source: 'native' | 'formField' | 'annotation' | 'ocr';
  /** Optional surrounding-line text (typically ±N characters from the
   *  match) for human / LLM readability. Trimmed and de-newlined. */
  context?: string;
}

/**
 * Page anomaly surfaced so agents can spot extraction or visual risks
 * that raw text alone hides: overlapping layout blocks, bodies crowded
 * against chrome, off-page bboxes, localized glyph noise / replacement
 * characters / CJK mojibake,
 * page-wide glyph-index garbage,
 * dense vector graphics whose form fields or chart paths are not text,
 * numeric table-like layouts whose rows/columns may flatten into plain text,
 * local math/text-order divergences whose visual order differs from native text,
 * large image regions whose internal labels will not appear in native text,
 * OCR-backed scan layers whose bboxes may drift from pixels, etc.
 */
export interface PageWarning {
  /** Machine-readable rule identifier. */
  code:
    | 'text_overlap'
    | 'near_bottom_edge'
    | 'body_near_repeated_chrome'
    | 'off_page'
    | 'glyph_garbage_text'
    | 'localized_glyph_noise'
    | 'font_mapping_warning'
    | 'dense_vector_graphics'
    | 'tabular_numeric_layout'
    | 'raster_backed_text_layer'
    | 'raster_text_layer_symbol_noise'
    | 'ocr_low_confidence'
    | 'ocr_native_text_mismatch'
    | 'large_raster_low_text_overlap'
    | 'reading_order_divergence';
  /**
   * `'error'` means likely data-integrity issue (off-page bbox usually
   * indicates a broken render or pathological PDF), `'warning'` means
   * a typesetting / readability concern that the extraction still
   * carried through faithfully. Agents typically gate on `severity` to
   * decide whether to surface to the user vs silently log.
   */
  severity: 'warning' | 'error';
  /** Human-readable summary of the rule's findings on this page. */
  message: string;
  /**
   * 0-based index into `page.layout.blocks` for the block the warning
   * primarily refers to. Lets callers highlight the block without
   * re-walking the bbox set. Omitted for warnings that don't pin to a
   * specific block.
   */
  blockIndex?: number;
  /**
   * For pair-wise rules (currently only `text_overlap`), the second
   * block's index. Convention: `blockIndex < otherBlockIndex`.
   */
  otherBlockIndex?: number;
  /**
   * 0-based index into `page.imageBoxes` for warnings that pin to a
   * raster image region. Lets callers re-render or inspect the exact
   * image box without matching by geometry.
   */
  imageBoxIndex?: number;
}

/**
 * Derived page-quality classification. The values are observational —
 * they tell the agent what pdfvision saw, not what the agent should do
 * about it.
 */
export interface PageQuality {
  /**
   * Native-text extraction outcome:
   *   - `ok` — the page has usable native text that is not sparse
   *     relative to non-text visual content.
   *   - `mixed_glyph_indices` — `0.05 <= nonPrintableRatio < 0.3`.
   *     Native text contains readable fragments mixed with raw glyph
   *     codes, so it is not trustworthy as the full human-visible page.
   *   - `unusable_glyph_indices` — `nonPrintableRatio >= 0.3`. pdf.js
   *     returned mostly raw glyph codes (no usable ToUnicode CMap), so
   *     `text` is binary garbage even though `charCount` may look healthy.
   *   - `sparse_text_with_visual_content` — native text exists, but it is
   *     too sparse to explain a visually populated page (often just a page
   *     number, decorative label, large watermark, or thin OCR residue over
   *     images/vectors).
   *   - `sparse_text_on_blank_visual` — native text exists, but the
   *     rendered page is effectively blank. Common in scanned-book front
   *     matter with hidden OCR residue, invisible/broken-font text, or
   *     render/text-layer mismatches.
   *   - `empty_but_visual_content` — `charCount === 0` AND the page has
   *     visual content (`imageCount > 0`, `vectorCount > 0`, a visible
   *     annotation appearance that is not contradicted by a blank render,
   *     or `renderContentRatio` is above the blank threshold when
   *     --render/--ocr ran). Typical of image-flattened slides, scans,
   *     vector-only diagrams / forms, and annotation-only review pages.
   *   - `empty` — `charCount === 0` and no visual content detected.
   *     Likely a genuinely blank page or a render failure (combine with
   *     `visualStatus` to disambiguate).
   */
  nativeTextStatus:
    | 'ok'
    | 'mixed_glyph_indices'
    | 'unusable_glyph_indices'
    | 'sparse_text_on_blank_visual'
    | 'sparse_text_with_visual_content'
    | 'empty_but_visual_content'
    | 'empty';
  /**
   * Rasterisation outcome, present only when `--render` or `--ocr`
   * actually rasterised the page:
   *   - `ok` — `renderContentRatio > 0.005`. The renderer drew
   *     clearly populated content.
   *   - `sparse` — the renderer drew only sparse visible marks, either
   *     `0.001 < renderContentRatio <= 0.005` or a tiny but corroborated
   *     image/vector/annotation trace below the blank threshold.
   *   - `blank` — the page came out
   *     effectively blank against its own dominant background;
   *     typically a render-pipeline failure (unsupported image format,
   *     missing fonts) or a genuinely blank page.
   * Absent when neither `--render` nor `--ocr` triggered a raster.
   */
  visualStatus?: 'ok' | 'sparse' | 'blank';
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
  /**
   * Viewer-visible page label for this page, present iff `pageLabels` was
   * requested and the PDF defines labels.
   */
  pageLabel?: string;
  charCount: number;
  imageCount: number;
  /**
   * Same field as {@link PageResult.vectorCount}. Mirrored on the overview
   * so agents can spot vector-heavy pages (forms, charts, diagrams,
   * slides with shapes but no raster images) before walking `pages[]`.
   */
  vectorCount: number;
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
  /**
   * Count of page anomalies detected on the page (mirror of
   * `pages[].warnings.length`). Surfaced on the overview so an agent
   * can spot problem pages from the top-level table without descending
   * into `pages[]`. Omitted when no warnings were emitted for the page.
   */
  warningCount?: number;
  /**
   * Count of search hits on the page (mirror of
   * `pages[].matches.length`). Lets an agent jump straight to the
   * pages a query landed on from the overview, without scanning
   * `pages[].matches` for each entry. Omitted when no `search` was
   * requested; present-with-`0` when search ran but the page had no
   * hits so consumers can tell "ran, found none" from "didn't run".
   */
  matchCount?: number;
  /**
   * Count of emitted vector path boxes on the page (mirror of
   * `pages[].vectorBoxes.length`). Omitted when `vectorBoxes` was not
   * requested; present-with-`0` when extraction ran but no path bboxes
   * were available.
   */
  vectorBoxCount?: number;
  /**
   * Count of crop-ready visual regions on the page (mirror of
   * `pages[].visualRegions.length`). Omitted when `visualRegions` was
   * not requested; present-with-`0` when extraction ran but no candidate
   * visual region was found.
   */
  visualRegionCount?: number;
  /**
   * Count of interactive form fields on the page (mirror of
   * `pages[].formFields.length`). Omitted when `formFields` was not
   * requested; present-with-`0` when extraction ran but the page has no
   * widget fields.
   */
  formFieldCount?: number;
  /**
   * Count of clickable PDF links on the page (mirror of
   * `pages[].links.length`). Omitted when `links` was not requested;
   * present-with-`0` when extraction ran but no link annotations exist.
   */
  linkCount?: number;
  /**
   * Count of non-link PDF annotations on the page (mirror of
   * `pages[].annotations.length`). Omitted when `annotations` was not
   * requested; present-with-`0` when extraction ran but no comments /
   * markup annotations exist.
   */
  annotationCount?: number;
  /**
   * Count of tagged-PDF structure nodes on the page. Omitted when
   * `structure` was not requested; present-with-`0` when extraction ran
   * but no page structure tree exists.
   */
  structureNodeCount?: number;
  width: number;
  height: number;
}

export interface DocumentResult {
  file: string;
  totalPages: number;
  metadata: DocumentMetadata;
  /**
   * Full document page-label array, 0-indexed by physical page number,
   * present iff page-label extraction was requested. Empty array means the
   * pass ran and the PDF has no custom page labels.
   */
  pageLabels?: string[];
  /**
   * Document-level embedded file attachment metadata, present iff
   * attachment extraction was requested. Empty array means the pass ran
   * and the PDF has no embedded file attachments.
   */
  attachments?: DocumentAttachment[];
  /**
   * Document outline / bookmarks, present iff outline extraction was
   * requested. Empty array means the pass ran and the PDF has no outline.
   */
  outline?: DocumentOutlineItem[];
  /**
   * Viewer-level document settings, present iff viewer extraction was
   * requested. Empty object means the pass ran and no viewer settings were
   * present.
   */
  viewer?: DocumentViewerState;
  /**
   * PDF optional content groups / layers, present iff layer extraction was
   * requested. `groups: []` means the pass ran and the PDF has no layers.
   */
  layers?: DocumentLayers;
  /**
   * Top-level density summary across the selected pages. Present when
   * more than one page was extracted; omitted for single-page outputs
   * where a one-row summary is just noise.
   */
  overview?: PageOverview[];
  pages: PageResult[];
}

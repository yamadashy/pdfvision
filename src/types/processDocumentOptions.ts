import type { RenderRegion } from './common.js';

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
   * text/choice values, link targets, and visible FreeText annotation
   * contents are searched too, even when `formFields` / `links` /
   * `annotations` were not requested for output; those hits use the
   * widget/link/annotation bbox, with comb text widgets narrowed to
   * matching cells when pdf.js exposes enough appearance metadata, and
   * carry `source: 'formField'` / `source: 'link'` /
   * `source: 'annotation'`. OCR text is also searched when {@link ocr}
   * is on — those matches come back with `source: 'ocr'` and use OCR
   * word boxes when available, with a page-level bbox fallback when OCR
   * output lacks word layout or word-level reconstruction misses a query
   * that exists in full `ocr.text`.
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
   * Emit embedded file attachment metadata in `attachments`.
   * Useful for PDFs whose viewer attachment pane or page file-attachment
   * annotations expose supplemental files. The attachment bytes are not
   * embedded in the structured output.
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

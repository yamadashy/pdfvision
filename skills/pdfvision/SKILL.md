---
name: pdfvision
description: "Extract text, metadata, per-page density signals, structural layout, image bounding boxes, optional OCR, and rendered page PNGs from a PDF using the pdfvision CLI. Use when the input is a `.pdf` URL, a local PDF path, or another agent skill produced a PDF that still needs structured extraction. Triggers on: 'read this pdf', 'extract from <file>.pdf', '.pdf', 'scan / slide / paper / form contents'."
---

# pdfvision

[pdfvision](https://github.com/yamadashy/pdfvision) extracts text + metadata + per-page density signals from any PDF, with opt-in OCR (`--ocr`, including OCR word boxes when tesseract returns layout), layout reconstruction (`--layout`), page anomaly warnings (`pages[].warnings[]` from layout geometry, glyph-noise, numeric-table, scan/OCR-layer, and image-box signals), raster image bounding boxes (`--image-boxes`, including image-bearing pattern fills), vector drawing counts (`vectorCount`), per-text-item geometry (`--geometry`), PNG rendering (`--render`, optionally sized with `--render-scale` and cropped with `--render-region`), and per-page text search with bbox (`--search`, hits ride into `--render-region` for one-pipeline find-then-zoom). Cached by content hash, so the second read of the same PDF returns in ~30 ms.

## Prerequisite

```bash
npx pdfvision --version
```

Requires Node.js >= 22.13. Install globally with `npm install -g pdfvision` if used repeatedly.

**Always run help once before reaching for non-obvious flags** — the flag set evolves (OCR, remote URLs, layout, geometry, image-boxes, render output) and the help text is the source of truth for what the installed version supports.

- Outside the pdfvision repository, use `npx pdfvision --help`.
- Inside the pdfvision repository during development, use `node --run pdfvision -- --help` or `node dist/bin/pdfvision.mjs --help` after `npm run build`. Avoid `npx pdfvision` / `npm exec pdfvision` there; npm can try to resolve the package against itself and exhaust the Node heap before the CLI starts.

## Quick reference

```bash
# Local PDF, markdown to stdout (per-page sections + density Overview table)
npx pdfvision /path/to/doc.pdf

# Fetch a PDF over http(s) — downloads to cache, validates the PDF header, then extracts
npx pdfvision --remote https://example.org/paper.pdf

# Page subset
npx pdfvision doc.pdf -p 1-5
npx pdfvision doc.pdf -p 1,3,5

# Programmatic / structured consumers
npx pdfvision doc.pdf -f json
npx pdfvision doc.pdf -f xml          # tag-shaped, some LLMs locate <page> faster than JSON keys
npx pdfvision doc.pdf -f toon --geometry  # same schema, ~40% fewer tokens on span/array-heavy output

# Image-flattened / scanned page — two options:
npx pdfvision scan.pdf --ocr -f json                     # tesseract.js OCR
npx pdfvision scan.pdf --render --render-output ./images # PNG for vision LLM

# Smaller / larger raster for vision-model payload
npx pdfvision slides.pdf --render --render-scale 1       # half-size PNG (default scale is 2)
npx pdfvision tiny.pdf --render --render-scale 3         # higher-detail PNG

# Zoom into a specific region on one page (PDF points, top-left origin)
npx pdfvision doc.pdf -p 3 --render --render-region 100,200,300,150

# Find a string with bbox of every hit — pipe match.bbox into --render-region for visual zoom
npx pdfvision report.pdf --search "revenue" --json
npx pdfvision paper.pdf --search "GPT" --search "transformer" --json  # multi-query (each match carries queryIndex)

# Wipe the on-disk cache
npx pdfvision --clear-cache
```

Format choice (`markdown` / `json` / `xml` / `toon`) does **not** change the cache slot — the structured payload is shared and only re-formatted on output.

`toon` ([Token-Oriented Object Notation](https://toonformat.dev)) is a lossless, schema-aware re-encoding of the same `DocumentResult` as `-f json`, tuned for tight LLM token budgets. Its win is concentrated in **uniform-array-heavy output**: `--geometry` (spans) drops ~40–48% of tokens versus the pretty-printed JSON because spans collapse into a CSV-like tabular form that names fields once. `layout.tables[].rows[].cells[]` also tabularizes well; plain text bodies and non-uniform `layout.blocks[]` compress less, so `-f xml` can still be more compact for block-heavy layout output. Reach for `toon` specifically when handing span/geometry-dense output to an LLM; otherwise `json` / `xml` remain the defaults. Decode back to the JSON data model with the `@toon-format/toon` package, so programmatic consumers lose nothing.

## Picking the right flags

The default extraction is enough for most native-text PDFs (papers, exports from Word / Pages / Markdown tooling). Reach for opt-ins only when the default isn't enough.

| Goal | Flag | When to reach for it |
|---|---|---|
| Reconstruct reading order, find headings, preserve table rows | `--layout` | Multi-column papers, including dense journal layouts with narrow repeated gutters or drop caps; Japanese vertical-writing slides/docs where CJK stacks surface as `writingMode: "vertical"`; slides where the agent must process blocks in order; table-heavy financial/government PDFs where `layout.tables[]` row-major hints preserve numeric row/cell relationships better than raw blocks, including dense recurring numeric gutters that would otherwise merge several values into one line |
| Know where images sit on the page | `--image-boxes` | Bbox overlay on rendered PNG, figure detection, masked/pattern image fills |
| Know where vector marks sit on the page | `--vector-boxes` | Maps, symbol tables, diagrams, chart paths, clipped shading/gradient panels, form boxes, table rules, slide shapes, and PDFs where visible structure is vector-drawn rather than raster images |
| Get crop-ready visual regions | `--visual-regions` | Figure/chart/diagram/table/form pages where an agent should use suggested `--render-region` bboxes, including nearby captions/form labels when found (`Figure`, `Table`, `Plate`, `図`, `表`, `図表`), short directly-below image labels, nearby or in-region headings for large unlabeled regions, and short table lead-ins such as "The following table..." or "... as follows:", instead of manually clustering raw image/vector/layout/form coordinates. Page-level `Plate` captions can attach as metadata to distant panel crops without expanding every crop to include the caption block. Page-sized background boxes are suppressed when more specific foreground geometry or dense vector-grid structure exists, including dense thin vector grids over full-page raster backdrops, and narrow page-edge chrome is suppressed so marginal ribbons, side URLs, and header/footer bands do not become vision targets; full-page covers/scans still emit renderable regions when only small logos or edge chrome compete with them. If full-page render evidence says the page is blank, visual regions are suppressed. Dense vector grids can produce fallback regions for table-like structures, dense small vector marker fields are clustered into separate dense visual-region crops when disconnected, dense forms produce section/row-sized crops instead of one page-sized crop, and repeated header/footer text is not attached as a caption when multi-page evidence is available. |
| Render suggested visual crops | `--render-visual-regions` | Same cases as `--visual-regions`, when the next step is a vision-model pass and the agent wants `visualRegions[].image` crops with associated captions/form labels, short table lead-ins, short image labels, or nearby headings without rendering every full page |
| Read form controls and blank fields | `--form-fields` | Government forms, applications, tax forms, questionnaires, and any PDF where checkboxes, radio buttons, signatures, text boxes, choice widgets, buttons, or their nearby visible labels are part of the meaning. Widget annotation flags such as `hidden`, `print`, or `noView` are exposed so agents can detect print-only or screen-hidden fields. Checkbox/radio export values and widget JavaScript actions are exposed when present, so agents can see submitted values, button click scripts, or other form-triggered behavior. Choice widgets include exported/display option values when the PDF exposes them, plus combo/list and multi-select flags. Stacked above/below label lines are merged when they form one visible prompt, so narrow fields can carry labels like "Employer identification number (EIN)" instead of only the closest line; narrow inline text fields can keep left-side instruction labels such as tax-classification prompts; right-edge amount boxes with dotted leaders can expand compact markers like "1 $" back to the visible prompt; fine-grained spans are also considered so adjacent same-row prompts such as "Middle Initial" and "Other Last Names Used" do not collapse onto both fields. |
| Capture clickable navigation | `--links` | Papers and manuals with citation links, table-of-contents jumps, cross-references, and external URLs whose clickable regions matter to a human PDF reader; internal links include the resolved physical target page when available |
| Capture comments and markup | `--annotations` | Reviewed PDFs, annotated drafts, PDFs with sticky notes, highlights, underlines, strikeouts, stamps, file-attachment icons, shape markup, ink, or other non-link annotation markup. Annotation flags such as `hidden`, `print`, or `noView` are exposed so agents can tell when markup may be print-only or not visible in a normal screen render. File-attachment annotations expose filename, description, and byte size metadata without embedding bytes in context. Shape annotations expose icon/name, border, line endpoint, polygon/polyline vertex, and ink path metadata when pdf.js provides it. |
| Capture tagged-PDF accessibility structure | `--structure` | Accessible PDFs, government forms/reports, manuals, and any PDF where figure alt text, role hierarchy, language hints, or structure bboxes may explain content that native text and rendered pixels alone do not label. Stray control bytes in structure strings are removed. |
| Capture viewer page labels | `--page-labels` | Long reports, specs, books, and papers where the PDF viewer shows roman front matter, section prefixes, or restarted page numbering that differs from physical page numbers |
| Capture embedded file attachments | `--attachments` (+ `--attachment-output <dir>` to save files) | PDFs whose viewer attachment pane exposes supplemental files; emits names, descriptions, byte sizes, and optional saved paths without dumping attachment bytes into context |
| Capture document sidebar navigation | `--outline` | Long reports, manuals, specifications, and papers where a human PDF reader would use bookmarks / outline entries to jump between sections, external URLs, or named viewer actions such as NextPage |
| Capture initial viewer state | `--viewer` | PDFs whose opening mode, page layout, viewer preferences, OpenAction, document/page JavaScript actions, permissions, or tagged-PDF MarkInfo affects how a human reader sees or navigates the document |
| Capture viewer layer panels | `--layers` | Maps, CAD/design PDFs, multilingual/variant documents, or any file where a human PDF reader can toggle optional content groups that may hide visible labels, overlays, or design alternatives |
| Open encrypted PDFs | `--password <value>` | Password-protected PDFs when the user explicitly provides the document password. The password is only used for pdf.js decryption and is never emitted in output. Do not guess or store passwords. |
| Per-glyph bbox + fontSize | `--geometry` | Heading detection by font-size, custom layout heuristics |
| Page is an image or native text is glyph-corrupted — get text from pixels | `--ocr` + `--ocr-lang` | `coverage: 0%` in the Overview, or `nonPrintableRatio >= 0.05` (native text includes glyph-index garbage; see below). **For non-English text, language order matters** — primary language goes first (`jpn+eng` for Japanese-dominant, `eng+jpn` for English-dominant). Full lang combinations and confidence semantics in `references/ocr.md`. |
| Hand the page to a vision model | `--render` + `--render-output <dir>` | Multimodal flows. Density Overview already flagged the page as low-text |
| Shrink / enlarge the rendered PNG | `--render-scale <n>` (default 2, bounds `(0, 4]`) | 1×: half-size payload, fine for most agentic-vision dispatch. 3×+: capture chart / fine-print detail |
| Zoom into a sub-rectangle of one page | `--render-region <x,y,w,h>` | Agent already saw a suspect block via `--layout` / `warnings[]` and only wants the visual confirmation of that bbox, not the whole page. PDF points, top-left origin, single-page only (errors if `--pages` resolves to multiple). Composes with `--render-scale` |
| Find every occurrence of a string with bbox | `--search <query>` (repeatable; `--search-regex` / `--search-case-sensitive` modifiers) | The agent's "where does this term appear?" question. Returns `pages[N].matches[*]` with span/word-level bbox so the bbox feeds straight into `--render-region` for a follow-up visual zoom — one-pipeline find-then-zoom, no second pass. Literal substring by default, case-insensitive, NFKC-aware (so `"fi"` matches the U+FB01 ligature). Also searches OCR text when `--ocr` is on (match carries `source: 'ocr'`, using OCR word boxes when present and supplementing from full `ocr.text` when word reconstruction misses one or more occurrences); duplicate OCR hits already covered by native matches are suppressed. |
| Skip the on-disk cache | `--no-cache` | Forced re-extraction. Default behaviour is cache-on |

## Detecting silent failures with the density Overview

When `result.pages.length > 1`, the markdown output starts with an Overview table that reports `Chars / Images / Coverage / Size` per page (plus `Vectors` when any page has vector drawing operations, `NonPrint` when any page has non-zero non-printable ratio, and `Blocks` when `--layout` was on). The JSON / XML output carries the same data in `overview[]` with field names `charCount` / `imageCount` / `vectorCount` / `textCoverage` / `nonPrintableRatio` / `nonPrintableCount` / `width` / `height` / `quality` — use the field names directly when grepping or filtering in code. Use the Overview before scrolling the body.

### One-shot dispatch: `pages[].quality`

Each page (and each overview row) carries a derived `quality` field that classifies the page from the raw signals so agents don't have to reimplement the threshold logic:

- `quality.nativeTextStatus`:
  - `ok` — usable native text that is not sparse relative to non-text visual content.
  - `mixed_glyph_indices` — `0.05 <= nonPrintableRatio < 0.3`. Native text contains readable fragments mixed with glyph-index garbage. Do not trust it as the full human-visible page.
  - `unusable_glyph_indices` — `nonPrintableRatio >= 0.3`. Text is mostly binary garbage even though `charCount` looks healthy. Fall back to `--render` or `--ocr`.
  - `sparse_text_with_visual_content` — native text exists, but it is too sparse to explain a visually populated page (for example, only a page number over an image-heavy slide, or a large `SAMPLE` watermark over a dense static form). Inspect with `--render`.
  - `sparse_text_on_blank_visual` — native text exists, but the rendered page is effectively blank. Treat the text as hidden OCR residue, invisible/broken-font text, or a render/text-layer mismatch until visually confirmed.
  - `empty_but_visual_content` — no native text, but the page carries images, vector drawings, visible annotation appearances that are not contradicted by a blank render, or non-blank pixels. Re-run with `--ocr` (or read the rendered PNG via `--render`).
  - `empty` — no text, no detected visual content. Likely a genuinely blank page (or a render failure — combine with `visualStatus` below).
- `quality.visualStatus` (present only when `--render` or `--ocr` ran):
  - `ok` — renderer drew clearly populated content.
  - `sparse` — renderer drew only sparse visible marks, including text-only or annotation-only pages whose ink sits just below the blank threshold. This is not a blank render; inspect with `--render-region` / `--visual-regions` when the small mark matters.
  - `blank` — page came out effectively blank against its own dominant background. Render-pipeline failure or genuinely blank page.

pdfvision deliberately stops at observation: it does **not** recommend an action. The action is the agent's call based on the two statuses + the raw signals below.

### Raw signals (the inputs to `quality`)

- `textCoverage: 0` (rendered as `coverage: 0%` in markdown) + `imageCount > 0` → the page body is a rasterised image. The text stream is empty. Re-run with `--ocr` or `--render`.
- Very low `textCoverage` plus `imageCount > 0` / `vectorCount > 0` and only a few characters → the visible page is mostly outside native text (`quality.nativeTextStatus === 'sparse_text_with_visual_content'`). Render before trusting the sparse text.
- Very low `charCount` plus dense vector structure can also map to `sparse_text_with_visual_content` even when `textCoverage` is not low, because one large watermark glyph run can cover much of the page while the visible form/table/chart content lives in vectors.
- Any native text plus `quality.visualStatus === 'blank'` → the native text is not visible in the rendered page (`quality.nativeTextStatus === 'sparse_text_on_blank_visual'`). Common in scanned-book front matter, invisible/broken-font text, and failed renders; do not treat the text as the human-visible page content.
- `vectorCount > 0` with low text coverage → visible non-raster structure exists (forms, chart paths, slide shapes, diagrams) even when `imageCount` is zero. Inspect with `--render` when the visual layout matters.
- `nonPrintableRatio >= 0.05` → pdf.js fell back to raw glyph indices for at least part of the page because some fonts lack a ToUnicode CMap (common with Hebrew, older CJK, custom symbol fonts, and branded annual reports). `0.05–0.3` maps to `quality.nativeTextStatus === 'mixed_glyph_indices'`: some text may be readable, but native extraction is incomplete. `>= 0.3` maps to `unusable_glyph_indices`: treat the native text as mostly garbage. The raw count is in `nonPrintableCount` — when the 3dp ratio rounds to 0 the count still tells you whether any non-printable code points slipped through (useful for "is there ANY garbage in this page?" filters).
- `charCount: 0` but `imageCount: 0` → genuinely blank page (separator, end matter).
- Sudden drop in `textCoverage` on a single page in an otherwise text-dense doc → that page is likely a figure / scan / chart. Inspect with `--render`.
- `quality.visualStatus === 'sparse'` → the rasterised page is not blank, but the visible marks are too small/sparse to call the page visually populated. This can be a one-line text-only page as well as a tiny image/vector/annotation mark. Use object geometry (`spans`, `vectorBoxes`, `imageBoxes`, `annotations`, `visualRegions`) or `--render-region` to inspect the mark instead of treating this as a render failure.
- `quality.visualStatus === 'blank'` → the rasterised page came out blank **against its own dominant background**. Likely a render-pipeline failure (pdf.js + @napi-rs/canvas can't decode JPEG2000 image streams, or the font has no resolvable glyphs) or a genuinely blank page. The ratio is background-aware — dark book covers and beige scan paper don't false-trip it. OCR on this page returns `confidence: 0` not because OCR failed but because the input was a near-uniform image.

### Warnings

`pages[].warnings[]` carries page anomalies that deserve visual attention.

- Geometry warnings (`text_overlap`, `near_bottom_edge`, `body_near_repeated_chrome`, `off_page`) require `--layout`.
- `glyph_garbage_text` uses always-on text-quality signals and fires when `quality.nativeTextStatus` is `mixed_glyph_indices` or `unusable_glyph_indices`, or when native text is dominated by Private Use Area glyph-code strings even though `nonPrintableRatio` is 0. Treat native `text`, `spans`, search hits, and layout text as incomplete or unreliable; inspect `--render` and consider `--ocr`.
- `localized_glyph_noise` uses always-on text-quality signals and fires when multiple non-printable code points appear below the mixed-glyph ratio threshold, when native text contains Unicode replacement characters (`U+FFFD`), when private-use glyph codes dominate a short run, when a CJK page contains isolated Latin-extended mojibake characters, or when text is dominated by Latin-1 supplement printable mojibake. Common cases: formulas, comparison symbols, unit marks, bullet symbols, dotted leaders, non-Latin custom fonts, or custom icon fonts that render fine but extract as control characters, replacement glyphs, or stray printable glyphs.
- `font_mapping_warning` uses captured pdf.js font/CMap warnings and fires when native text otherwise looks `ok` but pdf.js reported missing character-map data. Common case: a custom embedded font renders visibly but extracts as printable glyph substitutions; inspect `--render` when exact text matters.
- `dense_vector_graphics` uses the always-on `vectorCount` signal and fires on pages dominated by vector drawing operations. Common cases: forms, checkboxes, table rules, chart paths, and diagrams whose visible structure is not represented by native text.
- `tabular_numeric_layout` requires `--layout` and fires when many short numeric lines form multiple aligned columns with shared row positions. Common cases: financial statements and dense numeric tables whose row/column relationships are visually obvious but can be flattened in plain native text. Irregular financial tables can still surface when labelled rows have recurring numeric columns; chart-axis tick labels and irregular chart data-label rows are suppressed.
- `raster_backed_text_layer` can appear without `--layout` or `--image-boxes`. It means native text appears to be an OCR/text layer over a full-page raster scan, including sparse OCR layers on scanned covers. Treat the text as potentially useful but error-prone: recognition can be wrong, and `spans` / `layout.blocks` may not line up exactly with the pixels a human sees.
- `raster_text_layer_symbol_noise` can appear on raster-backed text layers when the native text is dominated by printable punctuation/symbol noise (for example old scan OCR title pages full of `^`, `_`, and stray marks). Treat native text as especially suspect even if `quality.nativeTextStatus` is still `ok`.
- `ocr_low_confidence` appears when `--ocr` ran, OCR confidence is below 0.5, and native extraction is empty, sparse, glyph-corrupted, or riding on a raster-backed text layer. Treat OCR text as tentative; compare with `--render`, adjust `--ocr-lang`, or crop/retry before trusting form labels or small print.
- `large_raster_low_text_overlap` can appear without `--image-boxes` on sparse-text visual pages when pdfvision's internal image pass sees a large raster. With `--image-boxes` plus `--layout` or `--geometry`, it can also compare native text bboxes against raster regions and include `imageBoxIndex` for pinpoint follow-up. Treat it as "labels, chart text, map text, or screenshot text inside this image may need `--render` / `--render-region` / OCR."
- `reading_order_divergence` requires `--layout` and fires when a heading that leads the visual reading order only appears in the back half of the native text stream (magazine-style frame layouts emitted out of order — the page title buried mid-`text`). Prefer `layout.blocks` order over `pages[].text` when sequence matters; Markdown output already switches to the layout-rebuilt body on these pages.

The density signal is the reason to prefer pdfvision over reading a PDF directly — silent failures (empty `text` that looks fine to a downstream consumer, or full `text` that is actually NUL bytes) become visible up front.

## Caching

- Cache root: `<os-tmp>/pdfvision/<content-sha>/` — macOS `/var/folders/.../T/pdfvision/`, Linux `/tmp/pdfvision/`. Override with `PDFVISION_CACHE_DIR=/path`.
- Keyed by **PDF content hash + flag combination**. Same PDF + same flags → ~30 ms on the second call. Different flags (e.g. add `--layout` later) → different slot, fresh extraction.
- `--remote` validates that the downloaded body contains a PDF header before caching. If a `.pdf` URL returns HTML (login/challenge/landing page), treat the failure as a source/download problem and choose another direct PDF URL.
- Wipe everything (cached extractions, rendered PNGs, downloaded remote PDFs, OCR traineddata) with `npx pdfvision --clear-cache`.

## Typical agent flow

**Inherit the user's scope first.** If the user already named a specific page or range ("page 2", "chapter 3", "the last few pages"), pass `-p` from step 1 — the density Overview works per page, so there's no need to scan a 100-page doc when the user pointed at page 2. Only run unscoped when the user genuinely asked about the whole document. Sections with conventional locations also help: "abstract" → `-p 1`, "conclusion" → `-p <last-few>`, "TOC" → `-p 1-3`.

**Pick a format that matches the consumer.** If the consumer is the LLM itself reading text inline (the typical "user asks me to read this PDF" case), the markdown default is already optimal — no flag needed. Switch to `-f json` only when a downstream programmatic step needs structured field access (`overview[]`, `pages[].layout`, `pages[].ocr`, etc.). XML when the LLM downstream parses tags more reliably than nested JSON. `-f toon` when the consumer is an LLM and the output is span/geometry-dense (`--geometry`) and token budget is tight — same schema, ~40% fewer tokens there (see the format note under Quick reference for where it does and doesn't help).

1. Run `npx pdfvision doc.pdf` (add `-p <range>` per the scope note, and `-f json` only when you'll consume structured fields) — gets text + density Overview for the selected pages.
2. Read the density signals (the markdown Overview table, or `overview[]` / `pages[].textCoverage` / `imageCount` / `vectorCount` / `charCount` in JSON) to find low-coverage or visually dense pages.
3. For low-coverage pages: re-run with `--ocr` if text is needed, or `--render` if a vision model will look at the rasterised page.
4. For structured / multi-column docs: re-run with `--layout` (and `--image-boxes` when figure positions matter).
5. **Zoom into a specific block when `--layout` flags one.** If `pages[].warnings[]` fires on a `blockIndex`, or `layout.blocks[i]` looks suspicious (overlapping bboxes, a chart you want a vision model to read), re-run with `--pages <N> --render --render-region <x,y,w,h>` using that block's bbox. The PNG comes back cropped to just the region (xywh × `--render-scale` = pixel dims), avoiding a full-page raster the model has to ignore most of.
6. **Locate a keyword and pipe straight into zoom.** When the user's question is "find where X is mentioned" (a model name, a number, a heading), run `--search "X" --json` to get `pages[N].matches[*]` with span-level bbox of every hit. Each match knows its page and bbox, so the same loop closes: `--pages <m.page> --render --render-region <m.bbox.x>,<m.bbox.y>,<m.bbox.width>,<m.bbox.height>` zooms onto the match. Repeat `--search` for multi-term searches (each match carries `queryIndex`). `--search-regex` for patterns, `--search-case-sensitive` when default insensitive-recall is too lossy.
7. Cache means steps 3–6 only re-pay the cost of the new flag combination on the affected page subset, not the whole extract.

## When to read `references/`

The base of this file already covers daily extraction. Open a reference file **only** in one of these specific cases — they are not always-on context, do not load speculatively.

Each entry is tagged as **mandatory** (read before producing the deliverable; this file doesn't carry enough on its own for the case) or **escalation** (read only if the basic guidance above isn't enough for the situation).

| Read this file | Gate | When |
|---|---|---|
| `references/structured-output.md` | **mandatory** when you're consuming `--layout`, `--image-boxes`, `--visual-regions`, `--geometry`, `--structure`, `--layers`, `--ocr`, or any other structured JSON / XML field whose schema isn't fully described in this file. SKILL.md only names the flags — the field-by-field shape lives in the reference. | Programmatic consumers of `-f json` / `-f xml`. Covers `DocumentResult` / `PageResult` / `LayoutBlock` / `ImageBox` / `TextSpan` / `PageOcr` schemas and coordinate-system semantics. |
| `references/ocr.md` | **escalation** for the easy cases (English-only, expected confidence). **Mandatory** when the user's text is non-English (lang ordering affects results), confidence is unexpectedly low, or the `tesseract.js` install / stderr is misbehaving. | Lang code combinations, primary-language ordering, traineddata cache, install diagnostics, troubleshooting (low confidence, blank PNG, stderr noise). |

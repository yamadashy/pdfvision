---
name: pdfvision
description: "Extract text, metadata, per-page density signals, structural layout, image bounding boxes, optional OCR, and rendered page PNGs from a PDF using the pdfvision CLI. Use when the input is a `.pdf` URL, a local PDF path, or another agent skill produced a PDF that still needs structured extraction. Triggers on: 'read this pdf', 'extract from <file>.pdf', '.pdf', 'scan / slide / paper / form contents'."
---

# pdfvision

[pdfvision](https://github.com/yamadashy/pdfvision) extracts text + metadata + per-page density signals from any PDF, with opt-in OCR (`--ocr`), layout reconstruction (`--layout`), page anomaly warnings (`pages[].warnings[]` from layout geometry, glyph-noise, numeric-table, scan/OCR-layer, and image-box signals), raster image bounding boxes (`--image-boxes`), vector drawing counts (`vectorCount`), per-text-item geometry (`--geometry`), PNG rendering (`--render`, optionally sized with `--render-scale` and cropped with `--render-region`), and per-page text search with bbox (`--search`, hits ride into `--render-region` for one-pipeline find-then-zoom). Cached by content hash, so the second read of the same PDF returns in ~30 ms.

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
| Reconstruct reading order, find headings, preserve table rows | `--layout` | Multi-column papers, including dense journal layouts with narrow repeated gutters or drop caps; Japanese vertical-writing slides/docs where CJK stacks surface as `writingMode: "vertical"`; slides where the agent must process blocks in order; table-heavy financial/government PDFs where `layout.tables[]` row-major hints preserve numeric row/cell relationships better than raw blocks |
| Know where images sit on the page | `--image-boxes` | Bbox overlay on rendered PNG, figure detection |
| Know where vector marks sit on the page | `--vector-boxes` | Maps, symbol tables, diagrams, chart paths, form boxes, table rules, slide shapes, and PDFs where visible structure is vector-drawn rather than raster images |
| Read form controls and blank fields | `--form-fields` | Government forms, applications, tax forms, questionnaires, and any PDF where checkboxes, radio buttons, signatures, text boxes, or choice widgets are part of the visible meaning |
| Capture clickable navigation | `--links` | Papers and manuals with citation links, table-of-contents jumps, cross-references, and external URLs whose clickable regions matter to a human PDF reader |
| Capture comments and markup | `--annotations` | Reviewed PDFs, annotated drafts, PDFs with sticky notes, highlights, underlines, strikeouts, stamps, or other non-link annotation markup |
| Capture tagged-PDF accessibility structure | `--structure` | Accessible PDFs, government forms/reports, manuals, and any PDF where figure alt text, role hierarchy, language hints, or structure bboxes may explain content that native text and rendered pixels alone do not label |
| Capture viewer page labels | `--page-labels` | Long reports, specs, books, and papers where the PDF viewer shows roman front matter, section prefixes, or restarted page numbering that differs from physical page numbers |
| Capture embedded file attachments | `--attachments` (+ `--attachment-output <dir>` to save files) | PDFs whose viewer attachment pane exposes supplemental files; emits names, descriptions, byte sizes, and optional saved paths without dumping attachment bytes into context |
| Capture document sidebar navigation | `--outline` | Long reports, manuals, specifications, and papers where a human PDF reader would use bookmarks / outline entries to jump between sections |
| Capture initial viewer state | `--viewer` | PDFs whose opening mode, page layout, viewer preferences, OpenAction, permissions, or tagged-PDF MarkInfo affects how a human reader sees or navigates the document |
| Capture viewer layer panels | `--layers` | Maps, CAD/design PDFs, multilingual/variant documents, or any file where a human PDF reader can toggle optional content groups that may hide visible labels, overlays, or design alternatives |
| Per-glyph bbox + fontSize | `--geometry` | Heading detection by font-size, custom layout heuristics |
| Page is an image or native text is glyph-corrupted — get text from pixels | `--ocr` + `--ocr-lang` | `coverage: 0%` in the Overview, or `nonPrintableRatio >= 0.05` (native text includes glyph-index garbage; see below). **For non-English text, language order matters** — primary language goes first (`jpn+eng` for Japanese-dominant, `eng+jpn` for English-dominant). Full lang combinations and confidence semantics in `references/ocr.md`. |
| Hand the page to a vision model | `--render` + `--render-output <dir>` | Multimodal flows. Density Overview already flagged the page as low-text |
| Shrink / enlarge the rendered PNG | `--render-scale <n>` (default 2, bounds `(0, 4]`) | 1×: half-size payload, fine for most agentic-vision dispatch. 3×+: capture chart / fine-print detail |
| Zoom into a sub-rectangle of one page | `--render-region <x,y,w,h>` | Agent already saw a suspect block via `--layout` / `warnings[]` and only wants the visual confirmation of that bbox, not the whole page. PDF points, top-left origin, single-page only (errors if `--pages` resolves to multiple). Composes with `--render-scale` |
| Find every occurrence of a string with bbox | `--search <query>` (repeatable; `--search-regex` / `--search-case-sensitive` modifiers) | The agent's "where does this term appear?" question. Returns `pages[N].matches[*]` with span-level bbox so the bbox feeds straight into `--render-region` for a follow-up visual zoom — one-pipeline find-then-zoom, no second pass. Literal substring by default, case-insensitive, NFKC-aware (so `"fi"` matches the U+FB01 ligature). Also searches OCR text when `--ocr` is on (match carries `source: 'ocr'`); duplicate OCR hits already covered by native matches are suppressed. |
| Skip the on-disk cache | `--no-cache` | Forced re-extraction. Default behaviour is cache-on |

## Detecting silent failures with the density Overview

When `result.pages.length > 1`, the markdown output starts with an Overview table that reports `Chars / Images / Coverage / Size` per page (plus `Vectors` when any page has vector drawing operations, `NonPrint` when any page has non-zero non-printable ratio, and `Blocks` when `--layout` was on). The JSON / XML output carries the same data in `overview[]` with field names `charCount` / `imageCount` / `vectorCount` / `textCoverage` / `nonPrintableRatio` / `nonPrintableCount` / `width` / `height` / `quality` — use the field names directly when grepping or filtering in code. Use the Overview before scrolling the body.

### One-shot dispatch: `pages[].quality`

Each page (and each overview row) carries a derived `quality` field that classifies the page from the raw signals so agents don't have to reimplement the threshold logic:

- `quality.nativeTextStatus`:
  - `ok` — usable native text that is not sparse relative to non-text visual content.
  - `mixed_glyph_indices` — `0.05 <= nonPrintableRatio < 0.3`. Native text contains readable fragments mixed with glyph-index garbage. Do not trust it as the full human-visible page.
  - `unusable_glyph_indices` — `nonPrintableRatio >= 0.3`. Text is mostly binary garbage even though `charCount` looks healthy. Fall back to `--render` or `--ocr`.
  - `sparse_text_with_visual_content` — native text exists, but it is too sparse to explain a visually populated page (for example, only a page number over an image-heavy slide). Inspect with `--render`.
  - `sparse_text_on_blank_visual` — native text exists, but it is sparse and the rendered page is effectively blank. Treat the text as hidden OCR residue or a render/text-layer mismatch until visually confirmed.
  - `empty_but_visual_content` — no native text, but the page carries images, vector drawings, or non-blank pixels. Re-run with `--ocr` (or read the rendered PNG via `--render`).
  - `empty` — no text, no detected visual content. Likely a genuinely blank page (or a render failure — combine with `visualStatus` below).
- `quality.visualStatus` (present only when `--render` or `--ocr` ran):
  - `ok` — renderer drew real content.
  - `blank` — page came out effectively blank against its own dominant background. Render-pipeline failure or genuinely blank page.

pdfvision deliberately stops at observation: it does **not** recommend an action. The action is the agent's call based on the two statuses + the raw signals below.

### Raw signals (the inputs to `quality`)

- `textCoverage: 0` (rendered as `coverage: 0%` in markdown) + `imageCount > 0` → the page body is a rasterised image. The text stream is empty. Re-run with `--ocr` or `--render`.
- Very low `textCoverage` plus `imageCount > 0` / `vectorCount > 0` and only a few characters → the visible page is mostly outside native text (`quality.nativeTextStatus === 'sparse_text_with_visual_content'`). Render before trusting the sparse text.
- Very low `textCoverage` plus `renderContentRatio <= 0.001` → the sparse native text is not visible in the rendered page (`quality.nativeTextStatus === 'sparse_text_on_blank_visual'`). Common in scanned-book front matter and failed renders; do not treat the text as the human-visible page content.
- `vectorCount > 0` with low text coverage → visible non-raster structure exists (forms, chart paths, slide shapes, diagrams) even when `imageCount` is zero. Inspect with `--render` when the visual layout matters.
- `nonPrintableRatio >= 0.05` → pdf.js fell back to raw glyph indices for at least part of the page because some fonts lack a ToUnicode CMap (common with Hebrew, older CJK, custom symbol fonts, and branded annual reports). `0.05–0.3` maps to `quality.nativeTextStatus === 'mixed_glyph_indices'`: some text may be readable, but native extraction is incomplete. `>= 0.3` maps to `unusable_glyph_indices`: treat the native text as mostly garbage. The raw count is in `nonPrintableCount` — when the 3dp ratio rounds to 0 the count still tells you whether any non-printable code points slipped through (useful for "is there ANY garbage in this page?" filters).
- `charCount: 0` but `imageCount: 0` → genuinely blank page (separator, end matter).
- Sudden drop in `textCoverage` on a single page in an otherwise text-dense doc → that page is likely a figure / scan / chart. Inspect with `--render`.
- `renderContentRatio <= 0.001` (when `--render` or `--ocr` was on) → the rasterised page came out blank **against its own dominant background**. Likely a render-pipeline failure (pdf.js + @napi-rs/canvas can't decode JPEG2000 image streams, or the font has no resolvable glyphs). The ratio is background-aware — dark book covers and beige scan paper don't false-trip it. OCR on this page returns `confidence: 0` not because OCR failed but because the input was a near-uniform image.

### Warnings

`pages[].warnings[]` carries page anomalies that deserve visual attention even when `quality.nativeTextStatus` is still `ok`.

- Geometry warnings (`text_overlap`, `near_bottom_edge`, `body_near_repeated_chrome`, `off_page`) require `--layout`.
- `localized_glyph_noise` uses always-on text-quality signals and fires when multiple non-printable code points appear below the mixed-glyph ratio threshold, or when a CJK page contains isolated Latin-extended mojibake characters. Common cases: formulas, bullet symbols, dotted leaders, or custom icon fonts that render fine but extract as control characters or stray printable glyphs.
- `dense_vector_graphics` uses the always-on `vectorCount` signal and fires on pages dominated by vector drawing operations. Common cases: forms, checkboxes, table rules, chart paths, and diagrams whose visible structure is not represented by native text.
- `tabular_numeric_layout` requires `--layout` and fires when many short numeric lines form multiple aligned columns. Common cases: financial statements and dense numeric tables whose row/column relationships are visually obvious but can be flattened in plain native text.
- `raster_backed_text_layer` can appear without `--layout` or `--image-boxes`. It means native text appears to be an OCR/text layer over a full-page raster scan. Treat the text as potentially useful, but don't assume `spans` / `layout.blocks` line up exactly with the pixels a human sees.
- `large_raster_low_text_overlap` requires `--image-boxes` plus `--layout` or `--geometry`, and fires when a large raster image has little native text overlapping it, including sparse-text visual pages. Treat it as "labels, chart text, map text, or screenshot text inside this image may need `--render` / `--render-region` / OCR."

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
| `references/structured-output.md` | **mandatory** when you're consuming `--layout`, `--image-boxes`, `--geometry`, `--structure`, `--layers`, `--ocr`, or any other structured JSON / XML field whose schema isn't fully described in this file. SKILL.md only names the flags — the field-by-field shape lives in the reference. | Programmatic consumers of `-f json` / `-f xml`. Covers `DocumentResult` / `PageResult` / `LayoutBlock` / `ImageBox` / `TextSpan` / `PageOcr` schemas and coordinate-system semantics. |
| `references/ocr.md` | **escalation** for the easy cases (English-only, expected confidence). **Mandatory** when the user's text is non-English (lang ordering affects results), confidence is unexpectedly low, or the `tesseract.js` install / stderr is misbehaving. | Lang code combinations, primary-language ordering, traineddata cache, install diagnostics, troubleshooting (low confidence, blank PNG, stderr noise). |

---
name: warnings
description: The pages[].warnings[] shape and severity, an index of every warning code with a one-line gloss, and the raw per-page density signals behind quality. "pdfvision docs warnings <code>" prints one code's entry.
---

# Warnings and raw density signals reference

`pages[].warnings[]` carries page anomalies that deserve visual attention, and the density Overview carries the raw per-page signals that feed `quality`. JSON-style paths here are exact for JSON, decoded TOON, and `processDocument()`; XML uses the mappings in `pdfvision docs formats`. `pdfvision docs schema` carries the `quality.nativeTextStatus` / `quality.visualStatus` field summary; this topic is the lookup companion for **what each raw signal means** and **which warning code means what**.

**Holding a code?** `pdfvision docs warnings <code>` prints just that code's entry — what it means, when it fires, its limits, and the next step. Several at once: `pdfvision docs warnings text_overlap off_page`. Read an entry only when a code needs interpretation past its self-explanatory inline `warning.message`; read this topic for orientation or for the raw signal thresholds behind a `quality` status.

pdfvision deliberately stops at observation: it does **not** recommend an action. The action is the agent's call based on the two `quality` statuses plus the raw signals below — whether to surface, re-OCR, or zoom in via `--render-region`. Silent failures — empty `text` that looks fine to a downstream consumer, or full `text` that is actually NUL bytes — become visible up front; that is the reason to prefer pdfvision over reading a PDF directly.

## Shape

```ts
interface PageWarning {
  code: string;               // one of the codes indexed below
  severity: 'warning' | 'error';
  message: string;
  blockIndex?: number;        // 0-based into pages[N].layout.blocks
  otherBlockIndex?: number;   // for pair-wise rules (text_overlap, body_near_repeated_chrome)
  imageBoxIndex?: number;     // 0-based into pages[N].imageBoxes for image-region rules
  tableIndex?: number;        // 0-based into pages[N].layout.tables for layout_table_uncertain
}
```

`pages[].warnings[]` is omitted when no rule fired.

**Severity.** `error` marks a likely data-integrity problem: what was extracted is not what a reader sees, or is not data about the file at all (`off_page`, `page_edge_text_truncated`, `invisible_text`, `text_under_opaque_fill`, and `xfa_form` when the placeholder is confirmed). `warning` marks a typesetting or readability concern that the extraction still carried through faithfully. Gate on `severity` to decide whether to surface a warning to the user or only log it.

**Availability.** Each index line says when a code can fire. Geometry warnings pin to layout blocks, so they require `--layout`, and are suppressed on heavily glyph-corrupted pages where native bboxes are not trustworthy. Several text-quality and image warnings ride on always-on or internal passes and appear even without the matching output flag. Image-region warnings can use pdfvision's internal image-box pass even when `--image-boxes` was not requested; `imageBoxIndex` is emitted only when public `pages[].imageBoxes` exists. Document-level codes (`xfa_form`, `xfa_fields_only`, `xfa_static_content`) are attached to the first extracted page and describe the whole selection rather than that page.

## Code index

<!-- warning-index -->

## The density Overview

When `result.pages.length > 1`, markdown output starts with an Overview table: `Chars / Images / Coverage / Size` per page, plus `Rotation` (when any page is rotated), `Vectors` (any page with vector drawing operations), `NonPrint` (any page with non-zero non-printable ratio), `Tables` (`--layout` found row-major table hints), and `Blocks` (`--layout` was on). With `--layout`, markdown also renders detected `layout.tables[]` as per-page `Layout tables` sections so financial statements and other numeric tables keep row/value relationships in chat-readable output.

JSON, decoded TOON, and `processDocument()` carry these signals in `overview[]` as `charCount` / `imageCount` / `vectorCount` / `textCoverage` / `nonPrintableRatio` / `nonPrintableCount` / `rotation` / `width` / `height` / nested `quality`. XML uses `<overview><page no="..." ...>` attributes, flattens `quality` into `nativeTextStatus` / `visualStatus`, and currently omits overview rotation. Read the Overview before scrolling the body.

## Raw signals (the inputs to `quality`)

- `textCoverage: 0` (rendered as `coverage: 0%` in markdown) + `imageCount > 0` → the page body is a rasterised image. The text stream is empty. Re-run with `--ocr` or `--render`.
- Very low `textCoverage` plus `imageCount > 0` / `vectorCount > 0` and only a few characters → the visible page is mostly outside native text (`quality.nativeTextStatus === 'sparse_text_with_visual_content'`). Render before trusting the sparse text.
- Very low `charCount` plus dense vector structure can also map to `sparse_text_with_visual_content` even when `textCoverage` is not low, because one large watermark text item can cover much of the page while the visible form/table/chart content lives in vectors.
- Any native text plus `quality.visualStatus === 'blank'` → the native text is not visible in the rendered page (`quality.nativeTextStatus === 'sparse_text_on_blank_visual'`). Common in scanned-book front matter, invisible/broken-font text, and failed renders; do not treat the text as the human-visible page content.
- `vectorCount > 0` with low text coverage → visible non-raster structure exists (forms, chart paths, slide shapes, diagrams) even when `imageCount` is zero. Inspect with `--render` when the visual layout matters.
- `nonPrintableRatio >= 0.05` → pdf.js fell back to raw glyph indices for at least part of the page because some fonts lack a ToUnicode CMap (common with Hebrew, older CJK, custom symbol fonts, and branded annual reports). `0.05–0.3` maps to `quality.nativeTextStatus === 'mixed_glyph_indices'`: some text may be readable, but native extraction is incomplete. `>= 0.3` maps to `unusable_glyph_indices`: treat the native text as mostly garbage. The raw count is in `nonPrintableCount` — when the 3dp ratio rounds to 0 the count still tells you whether any non-printable code points slipped through (useful for "is there ANY garbage in this page?" filters). Normalized `pages[].text` strips non-visible C0 controls other than tab / newline / carriage return, but these counters still use the pre-strip text signal so sparse control-byte evidence remains visible.
- `charCount: 0` but `imageCount: 0` → genuinely blank page (separator, end matter).
- Sudden drop in `textCoverage` on a single page in an otherwise text-dense doc → that page is likely a figure / scan / chart. Inspect with `--render`.
- `quality.visualStatus === 'sparse'` → the rasterised page is not blank, but the visible marks are too small/sparse to call the page visually populated. This can be a one-line text-only page as well as a tiny image/vector/annotation mark. Use object geometry (`spans`, `vectorBoxes`, `imageBoxes`, `annotations`, `visualRegions`) or `--render-region` to inspect the mark instead of treating this as a render failure.
- `quality.visualStatus === 'blank'` → the rasterised page came out blank **against its own dominant background**. Likely a render-pipeline failure (pdf.js + @napi-rs/canvas can't decode JPEG2000 image streams, or the font has no resolvable glyphs) or a genuinely blank page. The ratio is background-aware — dark book covers and beige scan paper don't false-trip it. OCR on this page returns `confidence: 0` not because OCR failed but because the input was a near-uniform image.

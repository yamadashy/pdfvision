---
title: Layout and Warnings
description: Understand pdfvision layout reconstruction, visual regions, geometry, and page warnings.
---

# Layout and Warnings

PDF meaning often lives in placement: columns, headings, form labels, tables, footnotes, figures, links, annotations, and repeated headers or footers. `--layout` keeps those signals available instead of reducing the page to one text stream.

For AI agents, this matters because a plausible text stream can still be wrong. A two-column paper can be read across columns, a financial table can lose row boundaries, a form value can drift away from its label, or a footer can be mistaken for body text. pdfvision exposes layout and warning signals so the agent can notice those cases.

## Layout Reconstruction

```bash
pdfvision document.pdf --layout --format json
```

Layout output includes:

- `pages[].layout.blocks[].lines`: reconstructed text lines with geometry.
- `pages[].layout.blocks`: reading-order blocks with roles and bounding boxes.
- `pages[].layout.tables`: numeric-table hints when rows and columns may be flattened in native text.
- vertical CJK text recovery when text should be read as a vertical stack.

Markdown output can use recovered layout order when the native text stream diverges from visual reading order. It also renders detected `layout.tables[]` as per-page layout table sections, preserving row/value relationships for financial statements and other numeric tables in chat-readable output.

Use layout when:

- the page has columns, sidebars, captions, or footnotes.
- the task depends on headings or section hierarchy.
- a form label must be associated with a value.
- table rows and columns matter.
- repeated page chrome should not be treated as body content.
- search results or extracted fields need visual coordinates for verification.

`layout.blocks` is not meant to hide native text. It gives the agent an alternate reading-order view with geometry and role hints, while `pages[].text` remains available for comparison.

## Geometry

```bash
pdfvision document.pdf --geometry --format json
```

`--geometry` emits one span per retained positioned pdf.js text item. An item may contain a character, word, or longer string; adjacent items remain separate. Each bbox is the rounded aggregate axis-aligned envelope, not glyph outlines. Each span also carries an approximate `fontSize` for uses such as heading detection. Layout/search can reconstruct lines or slice match boxes without changing public span granularity.

## Visual Boxes and Regions

```bash
pdfvision document.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

Important visual fields include:

- `pages[].imageBoxes` for raster image draws.
- `pages[].vectorBoxes` for vector drawings such as chart paths, table rules, form boxes, and slide shapes.
- `pages[].visualRegions` for crop-ready figure, chart, table, form, and diagram regions.

Use `--render-visual-regions` when the agent needs to inspect only those regions.

This is the key difference between "extract everything as text" and "look at the PDF". A slide chart, signature box, callout diagram, or table grid may have little useful native text, but its image/vector geometry tells the agent where to look.

Visual regions are useful as a bridge to multimodal models:

1. Use `--visual-regions` to discover candidate regions.
2. Pick a region with the right kind, page, bbox, and associated text.
3. Re-run with `--render-region` or use `--render-visual-regions`.
4. Ask a vision model to inspect only that evidence.

## Page Warnings

`pages[].warnings` describes anomalies that an agent should consider before trusting native text.

Common warning families include:

- overlapping text or off-page text boxes.
- body text crowded against repeated headers or footers.
- flattened numeric tables.
- native-vs-visual reading order divergence.
- glyph-garbage native text, private-use glyph strings, or localized mojibake.
- right-to-left script text whose inter-word spaces or paired brackets may degrade.
- OCR text layers over full-page scans, including symbol noise or word fragmentation.
- raster-dominated pages with no native text.
- low-confidence OCR on scan-like pages.
- large raster regions whose internal labels may need vision.
- dense vector pages such as forms, charts, or diagrams.

### Hidden Native Text

A PDF can contain successfully extracted and searchable native text that is not visible on the rendered page. These checks run by default—no geometry or vector flag is required—and they leave the original extracted text unchanged. Inspect `pages[].warnings` separately from `quality.nativeTextStatus`, which can still be `ok`.

| Code | What it means |
| --- | --- |
| `invisible_text` | Text was shown while PDF text rendering mode `Tr 3` was active, so it remains in native extraction but is not painted for a viewer. |
| `text_under_opaque_fill` | A later opaque dark rectangular fill covers extracted text. This can reveal a specific visual-only redaction failure, but it is not a general redaction detector. |

To avoid expected scan/OCR layers, `invisible_text` is suppressed when a full-page raster backs the page, while `text_under_opaque_fill` is suppressed when `raster_backed_text_layer` applies. Inspect the affected page as rendered:

```bash
pdfvision document.pdf -p 3 --render --format json
```

A render establishes only what the page visibly shows. Neither a warning nor its absence validates whether redaction succeeded, and absence does not certify visibility, correctness, or safety. These detectors do not find arbitrary hidden text or prompt injection. See `pdfvision docs warnings` for full warning details, and [Security and Privacy](./security-and-privacy.md) before acting on or sharing PDF-derived content.

Warnings are not final judgments. They are inspection cues that tell the agent which page or region deserves a closer look.

## How Agents Should Use Warnings

Treat warnings as routing signals:

- If native text is glyph-corrupted, compare a render or OCR before summarizing.
- If `rtl_script_text` appears, verify exact wording and paired brackets against a render.
- If reading order diverges, prefer layout blocks over raw page text for narrative order.
- If a table warning appears, preserve row and column evidence and crop the table when values matter.
- If large raster or dense vector warnings appear, assume labels may be visual-only until verified.
- If repeated chrome is involved, avoid mixing headers, footers, page numbers, and body text.

The important habit is not to fail the whole extraction. pdfvision gives the agent enough evidence to choose the next observation step.

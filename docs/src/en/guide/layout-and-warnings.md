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

- `pages[].layout.lines`: reconstructed text lines with geometry.
- `pages[].layout.blocks`: reading-order blocks with roles and bounding boxes.
- `pages[].layout.tables`: numeric-table hints when rows and columns may be flattened in native text.
- vertical CJK text recovery when text should be read as a vertical stack.

Markdown output can use recovered layout order when the native text stream diverges from visual reading order.

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

`--geometry` emits `pages[].spans`, a lower-level per-text-item list with bounding boxes and font sizes. Use spans for search highlights, overlays, and precise evidence mapping.

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
- OCR text layers over full-page scans, including symbol noise or word fragmentation.
- raster-dominated pages with no native text.
- low-confidence OCR on scan-like pages.
- large raster regions whose internal labels may need vision.
- dense vector pages such as forms, charts, or diagrams.

Warnings are not final judgments. They are inspection cues that tell the agent which page or region deserves a closer look.

## How Agents Should Use Warnings

Treat warnings as routing signals:

- If native text is glyph-corrupted, compare a render or OCR before summarizing.
- If reading order diverges, prefer layout blocks over raw page text for narrative order.
- If a table warning appears, preserve row and column evidence and crop the table when values matter.
- If large raster or dense vector warnings appear, assume labels may be visual-only until verified.
- If repeated chrome is involved, avoid mixing headers, footers, page numbers, and body text.

The important habit is not to fail the whole extraction. pdfvision gives the agent enough evidence to choose the next observation step.

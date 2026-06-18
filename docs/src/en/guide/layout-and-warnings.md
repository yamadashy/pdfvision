---
title: Layout and Warnings
description: Understand pdfvision layout reconstruction, visual regions, geometry, and page warnings.
---

# Layout and Warnings

PDF meaning often lives in placement: columns, headings, form labels, tables, footnotes, figures, links, annotations, and repeated headers or footers. `--layout` keeps those signals available instead of reducing the page to one text stream.

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

## Page Warnings

`pages[].warnings` describes anomalies that an agent should consider before trusting native text.

Common warning families include:

- overlapping text or off-page text boxes.
- body text crowded against repeated headers or footers.
- flattened numeric tables.
- native-vs-visual reading order divergence.
- glyph-garbage native text, private-use glyph strings, or localized mojibake.
- OCR text layers over full-page scans.
- low-confidence OCR on scan-like pages.
- large raster regions whose internal labels may need vision.
- dense vector pages such as forms, charts, or diagrams.

Warnings are not final judgments. They are inspection cues that tell the agent which page or region deserves a closer look.

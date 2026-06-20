---
title: Rendering and OCR
description: Render full pages, render visual regions, and OCR scanned PDF pages with pdfvision.
---

# Rendering and OCR

Native PDF text is not enough for scans, slides, charts, diagrams, screenshots, and visually encoded forms. Rendering and OCR make the page inspectable.

pdfvision treats rendering as evidence, not as a last resort. An agent can start with native text, notice that a page is visually populated or suspicious, then render either the full page or a small crop. This keeps multimodal calls targeted and auditable.

## When to Render

Render when the page's meaning is visual, or when extraction signals say native text may not represent what a human sees. Common triggers are high image/vector counts, sparse text with visible content, chart-heavy pages, forms, screenshots, maps, slide decks, and warnings about OCR layers or glyph-corrupted text.

You do not have to render everything. Start with the overview, then render the page or region that matters.

## Render Full Pages

```bash
pdfvision document.pdf --render --render-output ./images --format json
```

Each selected page receives an image path. The rendered image uses the same top-left coordinate system as layout boxes, so callers can map PDF points onto pixels.

Use `--render-scale` to control detail:

```bash
pdfvision document.pdf --render --render-scale 3
```

Smaller values reduce image size. Larger values help with small labels and dense diagrams.

Render full pages when:

- the PDF is a scan, slide deck, chart-heavy report, screenshot, map, or brochure.
- warnings suggest native text is sparse, glyph-corrupted, or visually contradicted.
- the task depends on exact visual placement.
- a model needs to inspect page appearance rather than only text.

The rendered image path is returned in `pages[].image`, so an agent can pass it directly to a vision-capable model.

## Render One Region

```bash
pdfvision document.pdf --pages 2 --render --render-region 120,180,360,240 --render-output ./regions
```

`--render-region` uses PDF points with a top-left origin. It is useful after a layout block, image box, or visual region identifies the area that needs zooming.

The same crop flow works after `--search`, because search matches can carry bounding boxes. See [Search and Region Zoom](./search-and-region-zoom.md).

Use region rendering for:

- verifying one contract clause or table cell.
- reading a chart legend or axis label.
- checking a checkbox group or form value.
- inspecting an equation, figure caption, or screenshot detail.
- reducing image tokens by sending only the evidence region to a vision model.

## Render Visual Regions

```bash
pdfvision document.pdf --render-visual-regions --render-output ./regions --format json
```

This renders crop-ready regions for figures, charts, forms, tables, diagrams, and raster/vector clusters without rendering every full page.

Use this when the agent does not yet know the coordinates. pdfvision will propose visual regions from layout, image, vector, annotation, and form evidence, then render those regions as separate PNGs.

## OCR

```bash
pdfvision scan.pdf --ocr --ocr-lang eng --format json
```

OCR output includes:

- recognized text.
- confidence.
- language.
- word boxes.

Use plus-separated languages for multilingual pages:

```bash
pdfvision scan.pdf --ocr --ocr-lang eng+jpn --format json
```

OCR is most useful when density signals or warnings show that native text is missing, sparse, scan-like, or low quality.

OCR does not overwrite native text. It is attached as a second signal so an agent can compare:

- native text from the PDF text layer.
- OCR text from rendered page pixels.
- OCR confidence and word boxes.
- page quality and warnings.

That comparison matters for scanned PDFs with hidden OCR layers. Some PDFs include an invisible text layer that looks complete to a text extractor but does not match what a human sees. pdfvision keeps both signals visible and warns when they disagree.

## Practical Strategy

Use this escalation path:

1. Run `pdfvision document.pdf --json`.
2. If a page is visual or suspicious, run `--render`.
3. If visible text is missing from native extraction, run `--ocr`.
4. If only one region matters, use `--search`, `--visual-regions`, or layout boxes to crop it.
5. If small text is hard to read, raise `--render-scale`.

This avoids running OCR or full-page vision over every page when most pages are already readable.

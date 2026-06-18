---
title: Rendering and OCR
description: Render full pages, render visual regions, and OCR scanned PDF pages with pdfvision.
---

# Rendering and OCR

Native PDF text is not enough for scans, slides, charts, diagrams, screenshots, and visually encoded forms. Rendering and OCR make the page inspectable.

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

## Render One Region

```bash
pdfvision document.pdf --pages 2 --render-region 120,180,360,240 --render-output ./regions
```

`--render-region` uses PDF points with a top-left origin. It is useful after a layout block, image box, or visual region identifies the area that needs zooming.

## Render Visual Regions

```bash
pdfvision document.pdf --render-visual-regions --render-output ./regions --format json
```

This renders crop-ready regions for figures, charts, forms, tables, diagrams, and raster/vector clusters without rendering every full page.

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

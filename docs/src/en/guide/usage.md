---
title: Usage
description: Common pdfvision workflows for local PDFs, remote PDFs, page ranges, rendering, layout, OCR, and encrypted documents.
---

# Usage

## Local PDFs

```bash
pdfvision document.pdf
```

## Remote PDFs

```bash
pdfvision --remote https://example.com/document.pdf --format json
```

Remote downloads are cached and validated as PDFs before extraction. If a `.pdf` URL returns HTML, a login page, or a challenge page, pdfvision fails before caching it.

## Page Ranges

```bash
pdfvision document.pdf --pages 1-3
pdfvision document.pdf --pages 1,3,5 --format json
```

## Render Pages

```bash
pdfvision document.pdf --render --render-output ./images --format json
```

Rendered PNG paths are attached to each page. Use `--render-scale` to control image detail:

```bash
pdfvision document.pdf --render --render-scale 3
```

## Extract Layout and Visual Structure

```bash
pdfvision document.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

This adds reconstructed layout blocks, image boxes, vector boxes, visual regions, and layout warnings.

## Render Only Important Regions

```bash
pdfvision document.pdf --render-visual-regions --render-output ./regions --format json
```

Use this when a full-page render is too large but figures, tables, forms, or chart regions need visual inspection.

## OCR Scanned Pages

```bash
pdfvision scan.pdf --ocr --ocr-lang eng --format json
pdfvision japanese-scan.pdf --ocr --ocr-lang eng+jpn --format json
```

OCR results include page text, confidence, language, and word boxes.

## Encrypted PDFs

```bash
pdfvision encrypted.pdf --password your-password --format json
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```

Prefer `--password-stdin` when a password should not appear in shell history or process arguments.

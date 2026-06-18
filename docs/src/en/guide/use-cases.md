---
title: Use Cases
description: Practical pdfvision workflows for AI agents reading research papers, slide decks, government forms, scanned PDFs, reports, tables, charts, and multilingual documents.
---

# Use Cases

pdfvision is useful whenever a PDF must be inspected by an AI agent rather than manually copied into a prompt. The best workflow depends on what kind of evidence the PDF contains.

## Research Papers

Use native text first, then add layout when columns, figures, equations, or tables matter.

```bash
pdfvision paper.pdf --layout --image-boxes --format json
```

Good follow-up checks:

- inspect `overview[]` for sparse or glyph-corrupted pages.
- use `--render-region` for figures, equations, and table fragments.
- use XML or TOON when the result will be fed directly to an LLM.

## Slide Decks and Reports

Slides often store meaning in images, vector shapes, and relative placement.

```bash
pdfvision deck.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

If the slide has large raster regions, render the page or just the visual regions:

```bash
pdfvision deck.pdf --render-visual-regions --format json
```

## Government Forms and Tax Documents

Forms combine visible labels, widget fields, checkboxes, annotations, and dense rules.

```bash
pdfvision form.pdf --layout --form-fields --annotations --links --format json
```

Use the field and label boxes with `--render-region` when a field relationship is ambiguous.

## Scanned Documents

Use density signals to confirm that native text is missing or sparse, then run OCR only on the pages that need it.

```bash
pdfvision scan.pdf --pages 1-5 --ocr --ocr-lang eng --format json
```

For multilingual pages, put the dominant language first:

```bash
pdfvision scan.pdf --ocr --ocr-lang jpn+eng --format json
```

## Charts, Diagrams, and Visual Tables

Start with visual structure and region detection:

```bash
pdfvision report.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

Then render only the relevant crop:

```bash
pdfvision report.pdf --pages 8 --render-region 80,140,430,260 --render-output ./regions
```

## Agentic PDF Triage

For unknown PDFs, start with a cheap overview:

```bash
pdfvision document.pdf --format json
```

Then branch:

- add `--layout` if reading order, tables, forms, or warnings matter.
- add `--render` if the page is visual or native text looks suspicious.
- add `--ocr` if native text is missing and the rendered page contains visible text.
- add `--visual-regions` when figures, charts, forms, or diagrams need targeted inspection.

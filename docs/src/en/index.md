---
layout: home
title: pdfvision
titleTemplate: Extract PDF signals for AI agents
hero:
  name: pdfvision
  text: Human-like PDF vision for AI agents
  tagline: Extract text, layout, visual regions, OCR, metadata, warnings, and rendered page images so agents can inspect PDF evidence instead of trusting a single flattened text stream.
  image:
    src: /logo.svg
    alt: pdfvision
  actions:
    - theme: brand
      text: Get Started
      link: /guide/
    - theme: alt
      text: GitHub
      link: https://github.com/yamadashy/pdfvision
features:
  - title: Agentic PDF triage
    details: Start with cheap native text and per-page quality signals, then decide whether to render, OCR, search, or crop.
  - title: Visual evidence on demand
    details: Render full pages, crop exact regions, or generate figure, chart, table, form, and diagram regions for multimodal models.
  - title: Layout and warning signals
    details: Preserve headings, columns, tables, form labels, links, annotations, and warnings that reveal when text extraction is incomplete.
---

## Why pdfvision

Most PDF extraction tools give an agent a single string and ask it to trust the result. That breaks down on real documents: research papers with two columns, slides where meaning sits in shapes, reports with charts and tables, government forms with widget fields, scanned pages with OCR residue, and multilingual PDFs whose text layer contains compatibility glyphs or mojibake.

pdfvision is built around a different loop:

1. Extract the native PDF signals.
2. Check whether those signals are trustworthy.
3. Locate the evidence that matters.
4. Render or OCR only the page or region that needs a closer look.

That loop is closer to how a human reads a PDF. You skim the page, notice when the visual page and extracted text disagree, zoom into a chart or form field, and keep the original evidence available for verification.

## What It Gives Agents

pdfvision combines the PDF signals an agent needs in one CLI and TypeScript library:

- Native text with Unicode normalization and optional raw text preservation.
- Per-page density and quality fields such as character count, image count, vector count, text coverage, and native text status.
- Layout blocks, headings, multi-column reading order, vertical CJK text handling, numeric table hints, and repeated header/footer detection.
- Rendered PNG pages and targeted crops for vision models.
- OCR text, confidence, language, and word boxes for scanned or image-backed pages.
- Search matches with bounding boxes across native text, visible form values, FreeText annotations, and OCR output.
- Raster image boxes, vector drawing boxes, and crop-ready visual regions for figures, charts, tables, forms, and diagrams.
- Form fields, links, annotations, outlines, page labels, layers, viewer settings, structure trees, and attachment metadata when requested.
- Warnings for the cues a human would notice: glyph garbage, suspicious OCR layers, dense vector diagrams, flattened tables, overlapping text, off-page content, hidden-layer risk, and reading-order divergence.

## Quick Start

Run pdfvision without installing it:

```bash
npx pdfvision document.pdf
```

Render pages for a multimodal model:

```bash
npx pdfvision document.pdf --render
```

Extract structured JSON from a URL:

```bash
npx pdfvision --remote https://raw.githubusercontent.com/mozilla/pdf.js-sample-files/master/tracemonkey.pdf --format json
```

Search for evidence, then crop only the matching area:

```bash
npx pdfvision report.pdf --search "revenue" --json
npx pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --json
```

Inspect visual structure without rendering every full page:

```bash
npx pdfvision slides.pdf --layout --image-boxes --vector-boxes --visual-regions --json
npx pdfvision slides.pdf --render-visual-regions --render-output ./regions --json
```

## Documentation

- [Getting Started](./guide/) explains the basic workflow.
- [Use Cases](./guide/use-cases) maps common PDF types to pdfvision command patterns.
- [Command Line Options](./guide/command-line-options) groups every important flag by task.
- [Structured Output](./guide/structured-output) explains the fields that agents and tools consume.
- [Layout and Warnings](./guide/layout-and-warnings) explains the visual-structure signals that should stay out of the short README pitch.
- [Rendering and OCR](./guide/rendering-and-ocr) covers image output, visual crops, and scanned documents.
- [Search and Region Zoom](./guide/search-and-region-zoom) shows how to find text evidence and render only the matching crop.

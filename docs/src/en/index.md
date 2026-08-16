---
layout: home
title: pdfvision
titleTemplate: Extract PDF signals for AI agents
hero:
  name: pdfvision
  text: Turn silent PDF failures into recoverable ones
  tagline: Empty scans, glyph garbage, and scrambled columns all come back looking like success. pdfvision extracts text, layout, and page images, flags problems page by page, and names the next step to take.
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
  - title: Check before trusting
    details: Every page carries quality signals, not just text. Warnings name the specific risk — glyph corruption, raster-backed text, reading-order divergence — and end in the next step to take.
  - title: Spend context progressively
    details: Start with cheap native text, narrow long documents by page, and opt into layout, OCR, or rendering only where the signals say a closer look is needed.
  - title: Search, zoom, render
    details: Find text evidence, then render just the matching region — one small crop reaches the vision model instead of every page image.
---

## Why pdfvision

The worst property of PDF extraction is that failure looks like success. A scan returns empty text, a broken font map returns readable-looking garbage, a two-column paper comes back interleaved — and every one of them comes back as a normal, successful result. An agent that trusts it answers wrong without ever knowing anything went wrong.

Most tools in this space aim at conversion: turn the PDF into clean Markdown and hope the result is faithful. pdfvision aims at diagnosis instead — it flags the pages where extraction cannot be trusted and fetches localized visual evidence there.

The loop it is built around:

1. Extract the native PDF signals.
2. Check whether those signals are trustworthy.
3. Locate the evidence that matters.
4. Render or OCR only the page or region that needs a closer look.

That loop is closer to how a human reads a PDF: skim the page, notice when the visual page and the extracted text disagree, and zoom into the chart or form field that decides the answer.

## What It Gives Agents

- **Quality signals on every page.** Character, image, and vector counts, text coverage, native-text status, and warnings for the cues a human would notice — each ending in the remedy, so the agent never needs to understand font maps or content streams.
- **Evidence only where it matters.** Search across native text, form values, annotations, links, and OCR output; every match carries its page and bounding box, ready to crop and render.
- **Structured output an agent can act on.** JSON, Markdown, TOON, and XML with layout blocks, form fields, links, outlines, and attachments — opt-in, so the default call stays cheap.

Layout reconstruction, OCR, visual regions, and the rest of the surface are covered in the [guides](./guide/).

## Quick Start

Run pdfvision without installing it:

```bash
npx pdfvision document.pdf
```

When extraction goes wrong, the page says so. Here the warning flags lines whose visual order and native text order diverge — and the lines it quotes expose a second problem: a figure's label column this PDF's font map does not decode:

```console
$ npx pdfvision tracemonkey.pdf -p 10
_chars: 6944 · images: 0 · coverage: 42% · vectors: 17 · warnings: 1 · size: 612×792pt_
… page body …
### Warnings
> **warning** (reading_order_divergence): layout line "?>9@AJ.0A:</C./8-2#3$4%56#" appears
> after "?>9@AJ.D<F@-<>2.@A:0>#3$4,56#" visually but earlier in the native text stream —
> native line order diverges from what a human reads; the body above is that reading order,
> rebuilt from the layout — render the page when exact sequence is critical
```

Without the warning, an agent reads `?>9@AJ.0A:</C./8-2#3$4%56#` as a successful extraction and never finds out otherwise.

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
- [Layout and Warnings](./guide/layout-and-warnings) covers the visual-structure signals in depth.
- [Rendering and OCR](./guide/rendering-and-ocr) covers image output, visual crops, and scanned documents.
- [Search and Region Zoom](./guide/search-and-region-zoom) shows how to find text evidence and render only the matching crop.

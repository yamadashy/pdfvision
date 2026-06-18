---
layout: home
title: pdfvision
titleTemplate: Extract PDF signals for AI agents
hero:
  name: pdfvision
  text: Give AI agents human-like PDF vision
  tagline: Extract text, layout, OCR, metadata, and rendered page images from PDFs so agents can inspect evidence instead of trusting a single flattened text stream.
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
  - title: Text plus visual evidence
    details: Combine native text, density signals, rendered pages, OCR text, and geometry in one agent-friendly result.
  - title: Layout-aware extraction
    details: Reconstruct lines, blocks, tables, form labels, annotations, links, and visual regions without hiding the raw PDF signal.
  - title: Warnings agents can act on
    details: Surface scan-like pages, glyph garbage, flattened tables, overlapping text, repeated chrome collisions, and other cues a human reader would notice.
---

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

## Documentation

- [Getting Started](./guide/) explains the basic workflow.
- [Use Cases](./guide/use-cases) maps common PDF types to pdfvision command patterns.
- [Command Line Options](./guide/command-line-options) groups every important flag by task.
- [Structured Output](./guide/structured-output) explains the fields that agents and tools consume.
- [Layout and Warnings](./guide/layout-and-warnings) explains the visual-structure signals that should stay out of the short README pitch.
- [Rendering and OCR](./guide/rendering-and-ocr) covers image output, visual crops, and scanned documents.

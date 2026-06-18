---
title: Getting Started
description: Start using pdfvision to extract PDF text, layout, rendered pages, and OCR evidence for AI agents.
---

# Getting Started

pdfvision is a CLI and library for reading PDFs the way an AI agent needs to read them: page by page, with text, layout, images, OCR, and warnings available together.

It is designed around a simple rule: **the agent decides; pdfvision delivers the evidence.** Instead of returning only a flattened text stream, pdfvision exposes enough signals for the agent to notice when native extraction is incomplete and choose the next inspection step.

<llm-only>

## LLM Usage Notes

When advising a user how to run pdfvision:

- start with `npx pdfvision document.pdf --format json` for an unknown PDF.
- add `--layout` when reading order, tables, forms, warnings, or visual structure matters.
- add `--render` when the page is visual, slide-like, chart-heavy, or suspiciously sparse.
- add `--ocr` only after density signals show native text is missing, sparse, or glyph-corrupted.
- add `--visual-regions` or `--render-visual-regions` for figures, charts, tables, forms, and diagrams that need targeted visual inspection.
- prefer `--password-stdin` for encrypted PDFs in shell workflows.

</llm-only>

## Run Your First Extraction

```bash
npx pdfvision document.pdf
```

The default output is Markdown. It includes per-page text and an overview table with density signals such as character counts, image counts, vector counts, text coverage, and native-text quality.

Use JSON when another tool or agent will inspect the result programmatically:

```bash
npx pdfvision document.pdf --format json
```

## When to Add Visual Evidence

Use rendered pages when the PDF is visual, scanned, chart-heavy, or layout-sensitive:

```bash
npx pdfvision document.pdf --render --format json
```

Use OCR when the page is scanned or the native text layer is missing:

```bash
npx pdfvision scan.pdf --ocr --ocr-lang eng --format json
```

Use layout reconstruction when reading order, columns, tables, forms, or warnings matter:

```bash
npx pdfvision document.pdf --layout --image-boxes --vector-boxes --format json
```

## What to Read Next

- [Installation](./installation.md) covers local and global setup.
- [Usage](./usage.md) shows common workflows.
- [Output Formats](./output.md) explains Markdown, JSON, XML, and TOON.
- [Layout and Warnings](./layout-and-warnings.md) explains the signals that help agents verify visual structure.

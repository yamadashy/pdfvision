---
title: Getting Started
description: Start using pdfvision to extract PDF text, layout, rendered pages, and OCR evidence for AI agents.
---

# Getting Started

pdfvision is a CLI and library for reading PDFs the way an AI agent needs to read them: page by page, with text, layout, images, OCR, and warnings available together.

It is designed around a simple rule: **the agent decides; pdfvision delivers the evidence.** Instead of returning only a flattened text stream, pdfvision exposes enough signals for the agent to notice when native extraction is incomplete and choose the next inspection step.

PDFs are not a single content type. A "PDF" can be a native text report, a scanned document, a PowerPoint export, a government form, a table-heavy financial statement, a paper with two-column reading order, a map, a brochure, or a mixture of all of those. pdfvision gives agents a way to adapt instead of forcing every file through one extraction strategy.

<llm-only>

## LLM Usage Notes

When advising a user how to run pdfvision:

- start with `npx pdfvision document.pdf --format json` for an unknown PDF.
- add `--layout` when reading order, tables, forms, warnings, or visual structure matters.
- add `--render` when the page is visual, slide-like, chart-heavy, or suspiciously sparse.
- add `--search` when the agent needs exact evidence locations or a follow-up crop.
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

For an unknown PDF, JSON is the best first pass because it gives the agent a machine-readable overview before it decides whether to spend more time on rendering or OCR:

```bash
npx pdfvision document.pdf --json
```

Look at:

- `overview[]` for page-by-page density and quality.
- `quality.nativeTextStatus` for empty, sparse, or glyph-corrupted native text.
- `imageCount` and `vectorCount` for visual pages that a text-only pass would miss.
- `warnings` for pages that need verification.

## The Agentic Reading Loop

pdfvision works best as a loop rather than a one-shot converter.

1. **Triage** with native text and overview fields.
2. **Preserve structure** with layout, image boxes, vector boxes, form fields, links, and annotations when placement matters.
3. **Find evidence** with `--search` when the agent is checking a claim, clause, field value, or table label.
4. **Zoom visually** with `--render-region` or `--render-visual-regions` when the extracted text is not enough.
5. **Recover missing text** with OCR only for pages that look scanned, raster-backed, or visually populated but text-empty.

This keeps context usage and processing cost under control. The agent does not need a full-page PNG for every page when only one chart label or form value is uncertain.

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

Search first, then crop only the matching area when exact evidence matters:

```bash
npx pdfvision document.pdf --search "revenue" --format json
npx pdfvision document.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --format json
```

## Common Starting Points

Use these as practical defaults:

- Unknown PDF: `npx pdfvision document.pdf --json`
- Research paper: `npx pdfvision paper.pdf --layout --image-boxes --json`
- Slide deck or visual report: `npx pdfvision deck.pdf --layout --image-boxes --vector-boxes --visual-regions --json`
- Scanned document: `npx pdfvision scan.pdf --ocr --ocr-lang eng --json`
- PDF form: `npx pdfvision form.pdf --layout --form-fields --annotations --links --json`
- Evidence search: `npx pdfvision report.pdf --search "term" --json`
- Vision crop: `npx pdfvision report.pdf --pages 2 --render --render-region 120,180,360,140 --render-output ./crops --json`

## How to Think About Flags

Start narrow and add signals when the page asks for them:

- `--layout` when reading order, headings, repeated chrome, tables, or form labels matter.
- `--image-boxes` when raster images may contain important content.
- `--vector-boxes` when charts, diagrams, table rules, form boxes, or slide shapes matter.
- `--visual-regions` when an agent needs candidate crops before calling a vision model.
- `--render` when the page must be visually verified.
- `--ocr` when visible text is missing from the native text layer.
- `--search` when the agent needs exact evidence locations.

## What to Read Next

- [Installation](./installation.md) covers local and global setup.
- [Usage](./usage.md) shows common workflows.
- [Output Formats](./output.md) explains Markdown, JSON, XML, and TOON.
- [Layout and Warnings](./layout-and-warnings.md) explains the signals that help agents verify visual structure.
- [Search and Region Zoom](./search-and-region-zoom.md) shows evidence search and targeted crop rendering.

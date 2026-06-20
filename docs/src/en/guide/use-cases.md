---
title: Use Cases
description: Practical pdfvision workflows for AI agents reading research papers, slide decks, government forms, scanned PDFs, reports, tables, charts, and multilingual documents.
---

# Use Cases

pdfvision is useful whenever a PDF must be inspected by an AI agent rather than manually copied into a prompt. The best workflow depends on what kind of evidence the PDF contains.

The common theme is verification. pdfvision is not only a "PDF to text" command; it is a way to expose the signals an agent needs to decide whether text extraction is enough, whether layout changed the meaning, and whether a specific visual region should be inspected.

## Unknown PDFs

Start with the cheapest structured pass:

```bash
pdfvision document.pdf --json
```

Use the overview as a routing table:

- `quality.nativeTextStatus: "ok"` usually means native text is a reasonable first source.
- `empty_but_visual_content` means the page likely needs rendering or OCR.
- high `imageCount` or `vectorCount` means charts, screenshots, forms, or slide graphics may contain meaning outside the text stream.
- warnings identify pages where a human would slow down before trusting extraction.

Then add only the needed signals:

```bash
pdfvision document.pdf --layout --image-boxes --vector-boxes --visual-regions --json
```

## Research Papers

Use native text first, then add layout when columns, figures, equations, or tables matter.

```bash
pdfvision paper.pdf --layout --image-boxes --format json
```

Good follow-up checks:

- inspect `overview[]` for sparse or glyph-corrupted pages.
- use `--search` to locate cited terms, equations, or claim text before rendering a crop.
- use `--render-region` for figures, equations, and table fragments.
- use XML or TOON when the result will be fed directly to an LLM.
- check `layout.blocks` and warning signals before trusting paper reading order on two-column pages.
- use `imageBoxes` and `visualRegions` to decide which figures or tables deserve multimodal inspection.

## Slide Decks and Reports

Slides often store meaning in images, vector shapes, and relative placement.

```bash
pdfvision deck.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

If the slide has large raster regions, render the page or just the visual regions:

```bash
pdfvision deck.pdf --render-visual-regions --format json
```

This is useful for strategy decks, conference slides, product PDFs, and dashboards exported as PDF. The text layer may contain bullet strings, but the conclusion may sit in the chart, arrow, timeline, screenshot, or relative position of shapes.

## Financial Reports and Dense Tables

Annual reports, earnings PDFs, invoices, and benchmark reports often flatten row and column relationships into a confusing text stream.

```bash
pdfvision report.pdf --layout --vector-boxes --visual-regions --search "Total revenue" --json
```

Use pdfvision to:

- find the page and bbox for a metric or row label.
- preserve numeric table hints when rows and columns are visually aligned.
- flag table-like pages whose native text order may not match the visual table.
- crop a chart, table, or footnote before asking a vision model to verify it.

```bash
pdfvision report.pdf --pages 12 --render --render-region 72,210,468,240 --render-output ./evidence --json
```

## Government Forms and Tax Documents

Forms combine visible labels, widget fields, checkboxes, annotations, and dense rules.

```bash
pdfvision form.pdf --layout --form-fields --annotations --links --format json
```

Use the field and label boxes with `--render-region` when a field relationship is ambiguous.

This helps an agent avoid the common failure mode where native text sees labels and values but loses the visual relationship between them. `--form-fields` exposes values, field types, labels, selected states, read-only or required flags, and widget metadata when the PDF contains interactive fields.

## Scanned Documents

Use density signals to confirm that native text is missing or sparse, then run OCR only on the pages that need it.

```bash
pdfvision scan.pdf --pages 1-5 --ocr --ocr-lang eng --format json
```

For multilingual pages, put the dominant language first:

```bash
pdfvision scan.pdf --ocr --ocr-lang jpn+eng --format json
```

OCR output is attached beside native text rather than replacing it. This lets an agent compare both signals, keep confidence scores visible, and render a higher-scale crop when small text or tables need verification.

## Charts, Diagrams, and Visual Tables

Start with visual structure and region detection:

```bash
pdfvision report.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

Then render only the relevant crop:

```bash
pdfvision report.pdf --pages 8 --render --render-region 80,140,430,260 --render-output ./regions
```

Use this for chart legends, plot labels, architecture diagrams, screenshots, maps, form sections, and tables whose meaning is graphical. `--visual-regions` is especially useful when the agent does not know the coordinates yet.

## Search-Then-Zoom Verification

When an agent needs to verify a specific clause, field, citation, metric, or label, search first:

```bash
pdfvision contract.pdf --search "termination" --search "governing law" --json
```

Each match can include page, source, context, and bounding boxes. The agent can then crop the exact region instead of rendering the whole document:

```bash
pdfvision contract.pdf --pages 9 --render --render-region 96,320,420,96 --render-output ./crops --json
```

This workflow is useful for retrieval-augmented agents that need auditable PDF evidence, not only extracted text.

## Multilingual and CJK PDFs

Japanese, Chinese, and mixed-language PDFs often expose spacing and glyph issues that text-only tools mishandle.

```bash
pdfvision document.pdf --layout --search "請求書" --json
```

pdfvision normalizes Unicode by default, keeps raw text when normalization changed it, handles CJK-aware spacing in joined text, and can recover vertical CJK layout signals. For scans, combine OCR languages:

```bash
pdfvision scan.pdf --ocr --ocr-lang jpn+eng --json
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

The goal is to keep agents honest: inspect the evidence, choose the next view, and avoid treating a blank or flattened text stream as the whole PDF.

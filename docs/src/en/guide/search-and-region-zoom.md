---
title: Search and Region Zoom
description: Use pdfvision to search PDF text, form fields, annotations, and OCR output, then render exact matching regions as PNG crops for AI vision models.
---

# Search and Region Zoom

pdfvision can find text evidence first, then render only the matching region. This is useful when an agent needs to verify a clause, table cell, figure label, form value, or OCR result without sending a full page image to a vision model.

This is one of the most agent-friendly workflows in pdfvision: use text search as a cheap locator, then switch to visual evidence only where it matters.

## Search a PDF

```bash
pdfvision report.pdf --search "revenue" --json
```

Matches are emitted in `pages[].matches[]`. Each match includes the page number, query, source, text snippet, and a bounding box when pdfvision can locate the visible area.

Repeat `--search` to run multiple queries in one pass:

```bash
pdfvision paper.pdf --search "transformer" --search "attention" --json
```

By default, search is literal, case-insensitive, and NFKC-aware. Add regex or exact-case matching only when the task needs it:

```bash
pdfvision report.pdf --search "Q[1-4] revenue" --search-regex --json
pdfvision report.pdf --search "PDF" --search-case-sensitive --json
```

Good search targets include:

- contract clauses and policy terms.
- financial metric labels.
- table row names.
- form values.
- figure captions and chart labels.
- OCR text on scanned pages.
- multilingual terms whose Unicode form may vary.

## What Search Covers

Search can match:

- native PDF text.
- text and choice values from `--form-fields`.
- visible FreeText annotation contents from `--annotations`.
- OCR text from `--ocr`, using OCR word boxes when available.

OCR matches that duplicate native, form-field, or annotation matches are suppressed so agents do not see the same visible text twice.

The match `source` helps the agent decide how much to trust it:

- `native`: text came from the PDF text layer.
- `formField`: text came from a visible widget value or display value.
- `annotation`: text came from a visible FreeText annotation.
- `ocr`: text came from page pixels and may need confidence review.

For multi-query searches, `queryIndex` lets the caller map each hit back to the repeated `--search` flag that produced it.

## Render the Matching Region

Take a match bbox and pass it to `--render-region`:

```bash
pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --json
```

`--render-region` requires exactly one selected page. The region uses PDF points with a top-left origin, and it must stay within the page bounds.

Use `--render-scale` when the crop contains small labels, superscripts, dense table cells, or chart legends:

```bash
pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-scale 3 --render-output ./crops --json
```

For best crops, add padding around a match bbox before passing it to `--render-region`. A little surrounding context helps vision models read labels, row headers, and nearby explanatory text.

## Agent Workflow

1. Run `--search` to locate candidate evidence.
2. Inspect `pages[].matches[]` and choose the bbox with the right source and page.
3. Re-run with `--pages`, `--render`, and `--render-region` for a visual crop.
4. Ask the vision model to compare the crop against the native text, OCR text, or extracted table data.

For visual regions that are not text-searchable, use [Rendering and OCR](./rendering-and-ocr.md) with `--visual-regions` or `--render-visual-regions`.

## Example: Auditable Claim Check

```bash
pdfvision annual-report.pdf --search "Net sales" --search "Operating income" --layout --json
```

An agent can inspect `pages[].matches[]`, choose the hit with the right page and surrounding context, then request a crop:

```bash
pdfvision annual-report.pdf --pages 42 --render --render-region 72,180,468,180 --render-output ./evidence --json
```

The final answer can cite both extracted text and the rendered evidence region.

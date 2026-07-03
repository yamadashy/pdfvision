---
title: Usage
description: Common pdfvision workflows for local PDFs, remote PDFs, page ranges, rendering, layout, OCR, and encrypted documents.
---

# Usage

This page shows common command patterns. For unknown PDFs, start with a structured first pass, inspect the page overview, then add layout, rendering, OCR, search, or visual regions only where the evidence calls for it.

## Recommended First Pass

```bash
pdfvision document.pdf --json
```

Use this to answer:

- Which pages have usable native text?
- Which pages are visual, scanned, or glyph-corrupted?
- Which pages have warnings?
- Which pages need layout reconstruction, OCR, or a rendered crop?

## Local PDFs

```bash
pdfvision document.pdf
```

## Remote PDFs

```bash
pdfvision --remote https://example.com/document.pdf --format json
```

Remote downloads are cached and validated as PDFs before extraction. If a `.pdf` URL returns HTML, a login page, or a challenge page, pdfvision fails before caching it.

`--remote` accepts only HTTP(S) URLs, follows redirects, and rejects responses that do not contain a PDF header near the start of the body. The default download guardrails are intentionally conservative: a 100 MB maximum body size and a 60 second network timeout.

Remote cache entries are keyed by URL. If a stable URL is updated in place, use `--no-cache` for a fresh one-off fetch or `--clear-cache` to remove the cached copy:

```bash
pdfvision --remote https://example.com/document.pdf --no-cache --format json
```

## Page Ranges

```bash
pdfvision document.pdf --pages 1-3
pdfvision document.pdf --pages 1,3,5 --format json
```

Page ranges are one-based physical page numbers. Commas combine selectors, ranges are inclusive, and duplicate pages are collapsed into sorted output.

Valid examples:

- `1`
- `1-5`
- `1,3,5`
- `2-4,7`

Invalid selectors fail loudly instead of guessing: empty segments, zero, negative numbers, descending ranges such as `5-3`, and malformed ranges are errors. If the selector includes pages beyond the end of the document but still selects at least one real page, pdfvision extracts the real pages and emits a warning for the skipped pages.

## Render Pages

```bash
pdfvision document.pdf --render --render-output ./images --format json
```

Rendered PNG paths are attached to each page. Use `--render-scale` to control image detail; OCR keeps at least scale 2 for recognition quality:

```bash
pdfvision document.pdf --render --render-scale 3
```

## Extract Layout and Visual Structure

```bash
pdfvision document.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

This adds reconstructed layout blocks, image boxes, vector boxes, visual regions, and layout warnings.

Use this for two-column papers, slide decks, financial reports, tables, forms, charts, diagrams, and any page where visual placement changes meaning.

## Render Only Important Regions

```bash
pdfvision document.pdf --render-visual-regions --render-output ./regions --format json
```

Use this when a full-page render is too large but figures, tables, forms, or chart regions need visual inspection.

## Search and Zoom

```bash
pdfvision report.pdf --search "revenue" --format json
pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --format json
```

Search matches include bounding boxes when pdfvision can locate the evidence. Pass the matching box to `--render-region` to create a small crop for visual verification.

This pattern is useful when an answer must be tied to auditable PDF evidence: search for the term, pick the matching page and bbox, then render the smallest useful crop.

## OCR Scanned Pages

```bash
pdfvision scan.pdf --ocr --ocr-lang eng --format json
pdfvision japanese-scan.pdf --ocr --ocr-lang eng+jpn --format json
```

OCR results include page text, confidence, language, and word boxes.

OCR is attached beside native text. It does not replace `pages[].text`, so agents can compare native extraction and OCR before deciding which evidence to trust.

## Forms, Links, and Annotations

```bash
pdfvision form.pdf --layout --form-fields --annotations --links --format json
```

Use this when a PDF contains widget values, checkboxes, radio groups, visible comments, links, or form labels whose meaning depends on page position.

## Outlines, Page Labels, and Document Features

```bash
pdfvision document.pdf --page-labels --outline --viewer --layers --format json
```

Use these options when the PDF viewer experience matters: page labels that differ from physical page numbers, bookmarks, open actions, optional content layers, or viewer preferences.

## Encrypted PDFs

```bash
pdfvision encrypted.pdf --password your-password --format json
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```

Prefer `--password-stdin` when a password should not appear in shell history or process arguments.

## Cache Control

```bash
pdfvision document.pdf --no-cache --json
pdfvision --clear-cache
```

pdfvision caches extraction results, rendered images, remote downloads, and OCR data so repeated agent reads are fast. Use `--no-cache` for one-off sensitive runs or `--clear-cache` to remove cached data.

Set `PDFVISION_CACHE_DIR` when an application needs cache data under a known directory:

```bash
PDFVISION_CACHE_DIR=/secure/pdfvision-cache pdfvision document.pdf --json
```

For remote PDFs, `--no-cache` also skips the remote-PDF cache and streams the freshly downloaded bytes into extraction. This is the safest option when a URL is private, time-limited, or expected to change without a versioned URL.

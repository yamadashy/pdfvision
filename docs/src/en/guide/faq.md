---
title: FAQ
description: Common pdfvision questions about empty text, scans, layout, OCR, rendering, cache behavior, and passwords.
---

# FAQ

## Is pdfvision a PDF-to-text tool or a vision tool?

It is both, but the main idea is evidence. pdfvision extracts native text when it is available, then exposes layout, image/vector geometry, warnings, rendered images, OCR, search matches, and PDF feature metadata so an agent can decide whether text alone is enough.

## Why is the extracted text empty?

The PDF may be scanned, image-heavy, encrypted, or built from custom glyph encodings. Check the overview fields and `pages[].warnings`, then retry with `--render`, `--ocr`, or `--layout`.

If the page has `empty_but_visual_content`, render or OCR it. If it has glyph warnings, compare the rendered page or OCR before trusting native text.

## When should I use `--layout`?

Use it when the page has columns, tables, forms, footnotes, repeated headers or footers, vertical CJK text, or any content where placement changes meaning.

`--layout` is especially useful for papers, reports, financial statements, forms, and slide exports where the raw text stream can be visually out of order.

## When should I use OCR?

Use `--ocr` when native text is missing, sparse, scan-like, or visibly different from the rendered page.

OCR is added beside native text; it does not replace it. Agents should compare native text, OCR text, confidence, and warnings.

## When should I render a region instead of a whole page?

Use `--render-region` after search, layout, image boxes, vector boxes, or visual regions identify the area that matters. Cropping is better than full-page rendering when a model only needs to verify one clause, table cell, chart label, form value, or figure.

## What are visual regions?

Visual regions are crop-ready page areas that likely contain a meaningful figure, chart, table, form section, annotation, diagram, or raster/vector cluster. They help agents discover where to look before sending images to a vision model.

## Can pdfvision search PDFs?

Yes. `--search` emits `pages[].matches[]` with page, source, matched text, context, and bounding boxes when available. Search can cover native text, visible form-field values, FreeText annotations, and OCR output when OCR is enabled.

## What coordinate system does pdfvision use?

Boxes use PDF user-space points with a top-left origin. `x` grows right and `y` grows downward. This matches rendered PNG orientation and simplifies overlays.

## Where does the cache live?

Results are cached under the operating system temp directory. Set `PDFVISION_CACHE_DIR=/path` to override it, use `--no-cache` to skip it, or run `pdfvision --clear-cache` to wipe cached entries.

## How should I pass PDF passwords?

Prefer `--password-stdin` so the password does not appear in process arguments:

```bash
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```

## Which output format should I use?

Use Markdown for a quick human-readable pass, JSON for tools and agent controllers, XML for tag-oriented prompts, and TOON when structured output is large and token budget is tight.

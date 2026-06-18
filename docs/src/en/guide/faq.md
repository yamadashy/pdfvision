---
title: FAQ
description: Common pdfvision questions about empty text, scans, layout, OCR, rendering, cache behavior, and passwords.
---

# FAQ

## Why is the extracted text empty?

The PDF may be scanned, image-heavy, encrypted, or built from custom glyph encodings. Check the overview fields and `pages[].warnings`, then retry with `--render`, `--ocr`, or `--layout`.

## When should I use `--layout`?

Use it when the page has columns, tables, forms, footnotes, repeated headers or footers, vertical CJK text, or any content where placement changes meaning.

## When should I use OCR?

Use `--ocr` when native text is missing, sparse, scan-like, or visibly different from the rendered page.

## What coordinate system does pdfvision use?

Boxes use PDF user-space points with a top-left origin. `x` grows right and `y` grows downward. This matches rendered PNG orientation and simplifies overlays.

## Where does the cache live?

Results are cached under the operating system temp directory. Set `PDFVISION_CACHE_DIR=/path` to override it, use `--no-cache` to skip it, or run `pdfvision --clear-cache` to wipe cached entries.

## How should I pass PDF passwords?

Prefer `--password-stdin` so the password does not appear in process arguments:

```bash
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```

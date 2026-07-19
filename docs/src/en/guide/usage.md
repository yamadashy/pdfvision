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

`--remote` accepts only initial HTTP(S) URLs, follows redirects, and rejects responses that do not contain a PDF header near the start of the body. The default guardrails are a 100 MB maximum body size and a 60-second deadline covering response headers and body transfer.

Use `--remote` only for a destination the user independently authorized. It validates the response, not the network destination, and does not block private addresses or redirect targets. Do not pass untrusted URLs directly: use a fetcher that validates every resolved IP and redirect hop against an allowlist and pins the connection, then pass a local file—or isolate pdfvision's fetch behind network controls. See [Security and Privacy](./security-and-privacy.md#remote-pdfs).

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
pdfvision japanese-scan.pdf --ocr --ocr-lang jpn+eng --format json
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
pdfvision document.pdf -p 1 --page-labels --outline --viewer --layers --format json
```

Use this probe when the PDF viewer experience matters: page labels that differ from physical page numbers, bookmarks, open actions, optional content layers, or viewer preferences. Here `-p 1` limits page extraction and emitted page output; it does not promise first-page-only document loading, parsing, or runtime. Without it, the feature flags still extract every page. Document-level fields still return. Page-level JavaScript actions are returned only for selected pages; when they matter, rerun `--viewer` with the relevant page range.

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

pdfvision caches extraction results, rendered images, remote downloads, and OCR data so repeated agent reads are fast. Use `--no-cache` when extraction results and remote PDF bytes should not be cached; use `--clear-cache` to remove cached data.

Set `PDFVISION_CACHE_DIR` to a nonblank absolute path naming a dedicated directory when an application needs cache data under a known location. Relative paths, `~`, filesystem roots, home, the working directory, and shared temporary roots are refused:

```bash
PDFVISION_CACHE_DIR=/secure/pdfvision-cache pdfvision document.pdf --json
```

An owned `.pdfvision-cache-root` marker authorizes recursive clearing. `--clear-cache` never adopts an unmarked custom root; with no `PDFVISION_CACHE_DIR` override, it may adopt the active historical default only after recognized legacy-shape scans before and after hardening. Normal use applies the same scans to every unmarked root. On POSIX, group/other-writable unmarked roots are refused, and every ancestor must be readable/openable, current-user/root-owned, and non-writable-or-safely-sticky. After quarantine rename, POSIX clearing compares `st_dev` and refuses recursive removal on a mismatch; the original pathname has already moved, and same-device bind mounts are not detected. Identity checks resist replacement only under conventional POSIX uid/mode/sticky semantics: ACLs and network-filesystem permissions are not inspected, and root or same-UID replacement after the final check cannot be excluded. Windows replacement resistance is best effort. Clearing is not coordinated with active OCR; retry an interrupted OCR run.

`--no-cache` skips extraction and remote-PDF caches, but renders without `--render-output` use separate OS-temporary paths, explicit render outputs still go where requested, and `--ocr` still uses persistent traineddata and worker support files under the validated cache root. An invalid `PDFVISION_CACHE_DIR` therefore still fails an OCR run even when `--no-cache` is set.

For remote PDFs, `--no-cache` also skips the remote-PDF cache and streams the freshly downloaded bytes into extraction. For private or time-limited URLs, this avoids retaining the downloaded PDF bytes; it also forces a fresh fetch when a URL may change in place. It does not make an otherwise unauthorized network destination safe.

---
name: pdfvision
description: "Extract text, metadata, per-page density signals, structural layout, image bounding boxes, optional OCR, and rendered page PNGs from a PDF using the pdfvision CLI. Use when the input is a `.pdf` URL, a local PDF path, or another agent skill produced a PDF that still needs structured extraction. Triggers on: 'read this pdf', 'extract from <file>.pdf', '.pdf', 'scan / slide / paper / form contents'."
---

# pdfvision

[pdfvision](https://github.com/yamadashy/pdfvision) extracts text + metadata + per-page density signals from any PDF, with opt-in OCR (`--ocr`), layout reconstruction (`--layout`), image bounding boxes (`--image-boxes`), per-text-item geometry (`--geometry`), and PNG rendering (`--render`). Cached by content hash, so the second read of the same PDF returns in ~30 ms.

## Prerequisite

```bash
npx pdfvision --version
```

Requires Node.js >= 22.13. Install globally with `npm install -g pdfvision` if used repeatedly.

**Always run `npx pdfvision --help` once before reaching for non-obvious flags** — the flag set evolves (OCR, remote URLs, layout, geometry, image-boxes, render output) and the help text is the source of truth for what the installed version supports.

## Quick reference

```bash
# Local PDF, markdown to stdout (per-page sections + density Overview table)
npx pdfvision /path/to/doc.pdf

# Fetch a PDF over http(s) — downloads to cache, then extracts
npx pdfvision --remote https://example.org/paper.pdf

# Page subset
npx pdfvision doc.pdf -p 1-5
npx pdfvision doc.pdf -p 1,3,5

# Programmatic / structured consumers
npx pdfvision doc.pdf -f json
npx pdfvision doc.pdf -f xml          # tag-shaped, some LLMs locate <page> faster than JSON keys

# Image-flattened / scanned page — two options:
npx pdfvision scan.pdf --ocr -f json                     # tesseract.js OCR
npx pdfvision scan.pdf --render --render-output ./images # PNG for vision LLM

# Wipe the on-disk cache
npx pdfvision --clear-cache
```

Format choice (`markdown` / `json` / `xml`) does **not** change the cache slot — the structured payload is shared and only re-formatted on output.

## Picking the right flags

The default extraction is enough for most native-text PDFs (papers, exports from Word / Pages / Markdown tooling). Reach for opt-ins only when the default isn't enough.

| Goal | Flag | When to reach for it |
|---|---|---|
| Reconstruct reading order, find headings | `--layout` | Multi-column papers, slides where the agent must process blocks in order |
| Know where images sit on the page | `--image-boxes` | Bbox overlay on rendered PNG, figure detection |
| Per-glyph bbox + fontSize | `--geometry` | Heading detection by font-size, custom layout heuristics |
| Page is an image — get text from raster | `--ocr` + `--ocr-lang` | `coverage: 0%` in the Overview (see below). Details in `references/ocr.md` |
| Hand the page to a vision model | `--render` + `--render-output <dir>` | Multimodal flows. Density Overview already flagged the page as low-text |
| Skip the on-disk cache | `--no-cache` | Forced re-extraction. Default behaviour is cache-on |

## Detecting silent failures with the density Overview

When `result.pages.length > 1`, the markdown output starts with an Overview table that reports `Chars / Images / Coverage / Size` per page. The JSON / XML output carries the same data in `overview[]`. Use it before scrolling the body:

- `coverage: 0%` + `imageCount > 0` → the page body is a rasterised image. The text stream is empty. Re-run with `--ocr` or `--render`.
- `charCount: 0` but `imageCount: 0` → genuinely blank page (separator, end matter).
- Sudden drop in coverage on a single page in an otherwise text-dense doc → that page is likely a figure / scan / chart. Inspect with `--render`.

The density signal is the reason to prefer pdfvision over reading a PDF directly — silent failures (empty `text` that looks fine to a downstream consumer) become visible up front.

## Caching

- Cache root: `<os-tmp>/pdfvision/<content-sha>/` — macOS `/var/folders/.../T/pdfvision/`, Linux `/tmp/pdfvision/`. Override with `PDFVISION_CACHE_DIR=/path`.
- Keyed by **PDF content hash + flag combination**. Same PDF + same flags → ~30 ms on the second call. Different flags (e.g. add `--layout` later) → different slot, fresh extraction.
- Wipe everything (cached extractions, rendered PNGs, downloaded remote PDFs, OCR traineddata) with `npx pdfvision --clear-cache`.

## Typical agent flow

1. Run `npx pdfvision doc.pdf -f json` — gets text + density Overview.
2. Read the `overview[]` to find low-coverage pages.
3. For low-coverage pages: re-run with `--ocr` if text is needed, or `--render` if a vision model will look at the rasterised page.
4. For structured / multi-column docs: re-run with `--layout` (and `--image-boxes` when figure positions matter).
5. Cache means steps 3–4 only re-pay the cost of the new flag combination on the affected page subset, not the whole extract.

## When to read `references/`

The base of this file already covers daily extraction. Open a reference file **only** in one of these specific cases — they are not always-on context, do not load speculatively.

| Read this file | When |
|---|---|
| `references/structured-output.md` | You are about to programmatically consume `-f json` / `-f xml` output and need the full `DocumentResult` / `PageResult` / `LayoutBlock` / `ImageBox` / `TextSpan` field reference, including coordinate-system semantics. |
| `references/ocr.md` | You are about to run `--ocr` and the user's text is non-English, or OCR confidence is unexpectedly low, or the optional `tesseract.js` install needs to be diagnosed. Covers lang code combinations, traineddata cache location, and primary-language ordering. |

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
| Page is an image — get text from raster | `--ocr` + `--ocr-lang` | `coverage: 0%` in the Overview, or `nonPrintableRatio >= 0.05` (text exists but is glyph-index garbage; see below). **For non-English text, language order matters** — primary language goes first (`jpn+eng` for Japanese-dominant, `eng+jpn` for English-dominant). Full lang combinations and confidence semantics in `references/ocr.md`. |
| Hand the page to a vision model | `--render` + `--render-output <dir>` | Multimodal flows. Density Overview already flagged the page as low-text |
| Skip the on-disk cache | `--no-cache` | Forced re-extraction. Default behaviour is cache-on |

## Detecting silent failures with the density Overview

When `result.pages.length > 1`, the markdown output starts with an Overview table that reports `Chars / Images / Coverage / Size` per page (plus `NonPrint` when any page has non-zero non-printable ratio, and `Blocks` when `--layout` was on). The JSON / XML output carries the same data in `overview[]` with field names `charCount` / `imageCount` / `textCoverage` / `nonPrintableRatio` / `width` / `height` — use the field names directly when grepping or filtering in code. Use the Overview before scrolling the body:

- `textCoverage: 0` (rendered as `coverage: 0%` in markdown) + `imageCount > 0` → the page body is a rasterised image. The text stream is empty. Re-run with `--ocr` or `--render`.
- `nonPrintableRatio >= 0.05` → pdf.js fell back to raw glyph indices because the PDF's fonts lack a ToUnicode CMap (common with Hebrew, older CJK, custom symbol fonts). `text` reads as full coverage but is binary garbage. Do **not** trust native text on these pages — re-run with `--render` to look at the page visually, or `--ocr` to extract via raster. Values `>= 0.3` are pathological; `< 0.01` is normal.
- `charCount: 0` but `imageCount: 0` → genuinely blank page (separator, end matter).
- Sudden drop in `textCoverage` on a single page in an otherwise text-dense doc → that page is likely a figure / scan / chart. Inspect with `--render`.

The density signal is the reason to prefer pdfvision over reading a PDF directly — silent failures (empty `text` that looks fine to a downstream consumer, or full `text` that is actually NUL bytes) become visible up front.

## Caching

- Cache root: `<os-tmp>/pdfvision/<content-sha>/` — macOS `/var/folders/.../T/pdfvision/`, Linux `/tmp/pdfvision/`. Override with `PDFVISION_CACHE_DIR=/path`.
- Keyed by **PDF content hash + flag combination**. Same PDF + same flags → ~30 ms on the second call. Different flags (e.g. add `--layout` later) → different slot, fresh extraction.
- Wipe everything (cached extractions, rendered PNGs, downloaded remote PDFs, OCR traineddata) with `npx pdfvision --clear-cache`.

## Typical agent flow

**Inherit the user's scope first.** If the user already named a specific page or range ("page 2", "chapter 3", "the last few pages"), pass `-p` from step 1 — the density Overview works per page, so there's no need to scan a 100-page doc when the user pointed at page 2. Only run unscoped when the user genuinely asked about the whole document. Sections with conventional locations also help: "abstract" → `-p 1`, "conclusion" → `-p <last-few>`, "TOC" → `-p 1-3`.

**Pick a format that matches the consumer.** If the consumer is the LLM itself reading text inline (the typical "user asks me to read this PDF" case), the markdown default is already optimal — no flag needed. Switch to `-f json` only when a downstream programmatic step needs structured field access (`overview[]`, `pages[].layout`, `pages[].ocr`, etc.). XML when the LLM downstream parses tags more reliably than nested JSON.

1. Run `npx pdfvision doc.pdf` (add `-p <range>` per the scope note, and `-f json` only when you'll consume structured fields) — gets text + density Overview for the selected pages.
2. Read the density signals (the markdown Overview table, or `overview[]` / `pages[].textCoverage` / `imageCount` / `charCount` in JSON) to find low-coverage pages.
3. For low-coverage pages: re-run with `--ocr` if text is needed, or `--render` if a vision model will look at the rasterised page.
4. For structured / multi-column docs: re-run with `--layout` (and `--image-boxes` when figure positions matter).
5. Cache means steps 3–4 only re-pay the cost of the new flag combination on the affected page subset, not the whole extract.

## When to read `references/`

The base of this file already covers daily extraction. Open a reference file **only** in one of these specific cases — they are not always-on context, do not load speculatively.

Each entry is tagged as **mandatory** (read before producing the deliverable; this file doesn't carry enough on its own for the case) or **escalation** (read only if the basic guidance above isn't enough for the situation).

| Read this file | Gate | When |
|---|---|---|
| `references/structured-output.md` | **mandatory** when you're consuming `--layout`, `--image-boxes`, `--geometry`, `--ocr`, or any other structured JSON / XML field whose schema isn't fully described in this file. SKILL.md only names the flags — the field-by-field shape lives in the reference. | Programmatic consumers of `-f json` / `-f xml`. Covers `DocumentResult` / `PageResult` / `LayoutBlock` / `ImageBox` / `TextSpan` / `PageOcr` schemas and coordinate-system semantics. |
| `references/ocr.md` | **escalation** for the easy cases (English-only, expected confidence). **Mandatory** when the user's text is non-English (lang ordering affects results), confidence is unexpectedly low, or the `tesseract.js` install / stderr is misbehaving. | Lang code combinations, primary-language ordering, traineddata cache, install diagnostics, troubleshooting (low confidence, blank PNG, stderr noise). |

---
name: pdfvision
description: "Extract text, metadata, per-page density signals, layout, image boxes, OCR, and page PNGs from a PDF via the pdfvision CLI. Use when the input is a `.pdf` URL, a local PDF path, or a PDF another agent skill produced. Triggers on: 'read this pdf', 'extract from <file>.pdf', '.pdf', 'scan / slide / paper / form contents'."
---

# pdfvision

[pdfvision](https://github.com/yamadashy/pdfvision) reads any PDF into text, metadata, and per-page density signals, cached by content hash so the second read is ~30 ms.

## Prerequisite

```bash
npx pdfvision --version   # Node.js >= 22.13; `npm i -g pdfvision` if used a lot
```

Consult `--help` only right before using a non-obvious flag — the flag set evolves; help is the source of truth. Outside the repo: `npx pdfvision --help`; in-repo dev: `node --run pdfvision -- --help` (not `npx pdfvision` — it can exhaust the Node heap resolving the package against itself).

## Quick reference

```bash
npx pdfvision /path/to/doc.pdf                 # markdown + density Overview to stdout
npx pdfvision --remote https://ex.org/p.pdf    # fetch over http(s); validates header, caches
npx pdfvision doc.pdf -p 1-5                    # page subset (also -p 1,3,5)
npx pdfvision doc.pdf -f json                  # structured; also -f xml, -f toon
npx pdfvision scan.pdf --ocr -f json           # OCR an image/scanned page
npx pdfvision scan.pdf --render --render-output ./img               # PNG for a vision LLM
npx pdfvision doc.pdf -p 3 --render --render-region 100,200,300,150 # zoom a region (PDF points)
npx pdfvision report.pdf --search "revenue" --matches-only          # v0.13.0+: report + bboxes
```

Format does **not** change the cache slot — the payload is shared and re-formatted on output. `toon` ([Token-Oriented Object Notation](https://toonformat.dev)) is a lossless, token-lean re-encoding of `-f json`, best for array-heavy output (`--geometry`, `layout.tables`); `-f xml` suits block-heavy layouts.

## Picking the right flags

Default extraction is enough for most native-text PDFs; reach for opt-ins only when it isn't. Full caveats: `references/flags.md`.

| Flag | Reach for it when |
|---|---|
| `--layout` | Multi-column papers, CJK vertical writing, slide block order, financial/gov `layout.tables[]` |
| `--image-boxes` / `--vector-boxes` | Where raster / vector marks sit (figures, maps, diagrams, chart paths, form rules) |
| `--visual-regions` (+ `--render-visual-regions`) | Crop-ready `--render-region` bboxes + captions for figure/chart/table/form pages |
| `--form-fields` | Checkboxes, radios, text/choice widgets, buttons, and their labels |
| `--links` / `--annotations` | Clickable links & targets; notes, highlights, stamps, ink, shape markup |
| Document metadata | `--structure`, `--page-labels`, `--attachments` (+`--attachment-output`), `--outline`, `--viewer`, `--layers` |
| `--password` / `--password-stdin` | Encrypted PDFs; password never guessed or emitted |
| `--geometry` | Per-glyph bbox + fontSize (heading detection); JSON/XML/TOON only |
| `--ocr` + `--ocr-lang` | `coverage: 0%` / `nonPrintableRatio >= 0.05`; primary lang first (`jpn+eng`) — see `references/ocr.md` |
| `--render` (+ `--render-output` / `--render-scale` / `--render-region`) | Rasterise for vision; scale 1 = half-size, 3×+ = detail (default 2); `--render-region <x,y,w,h>` zooms one block (single-page) |
| `--search <query>` | "Where does X appear?" `pages[N].matches[*]` with bbox; `--matches-only`, `--search-regex`, `--search-case-sensitive` |
| `--no-cache` | Force re-extraction |

Japanese/Chinese furigana/ruby is attached inline as `base《ruby》` automatically (searchable both ways; see `references/flags.md`).

## Density Overview and one-shot dispatch

Multi-page docs open with a density Overview table — `Chars / Images / Coverage / Size` per page (plus `Rotation` / `Vectors` / `NonPrint` / `Tables` / `Blocks` when relevant; `overview[]` in JSON/XML). Read it before the body — silent failures (empty `text` that looks fine, or NUL-byte `text`) show up front. Columns, thresholds, and warning catalog: `references/warnings.md`.

Each page/overview row carries a derived `quality` field (observation only; the agent acts). `quality.nativeTextStatus`:

| Status | Meaning → action |
|---|---|
| `ok` | Usable native text, not sparse vs visual content. |
| `mixed_glyph_indices` | `nonPrintableRatio` `0.05–0.3`; readable fragments + glyph garbage, not the full page. |
| `unusable_glyph_indices` | `>= 0.3`; mostly garbage despite `charCount` → `--render` / `--ocr`. |
| `sparse_text_with_visual_content` | Text too sparse for a populated page (page-number over a slide, watermark) → `--render`. |
| `sparse_text_on_blank_visual` | Text present but render blank; hidden OCR residue / invisible font until confirmed. |
| `empty_but_visual_content` | No text, but images / vectors / annotations / pixels → `--ocr` or `--render`. |
| `empty` | No text, no visual content — likely blank (or a render failure; check `visualStatus`). |

`quality.visualStatus` (only with `--render` / `--ocr`): `ok` = clearly populated; `sparse` = faint marks only (text/annotation-only included), not blank — inspect `--render-region` / `--visual-regions`; `blank` = blank against its own dominant background (render failure or genuinely blank).

`pages[].warnings[]` flags page anomalies with a self-explanatory `message` (all surface in default markdown). Read `references/warnings.md` only when a code needs more than its message.

## Caching

- Cache root `<os-tmp>/pdfvision/<content-sha>/` (override: `PDFVISION_CACHE_DIR=/path`).
- Keyed by **content hash + flag combination**: same PDF + same flags → ~30 ms; new flags (e.g. adding `--layout`) → a fresh slot.
- `--remote` validates a PDF header before caching; a `.pdf` URL that returns HTML (login/landing) is a source problem — pick another direct URL.
- `npx pdfvision --clear-cache` wipes extractions, rendered PNGs, remote downloads, and OCR traineddata.

## Typical agent flow

**Inherit the user's scope first.** If the user named a page/range, pass `-p` from step 1 (abstract → `-p 1`, conclusion → `-p <last-few>`, TOC → `-p 1-3`) instead of scanning the whole doc. The markdown default needs no flag; switch format only per Quick reference.

1. Run `npx pdfvision doc.pdf` (`-p <range>`; `-f json` only for structured fields) — text + Overview.
2. Read the Overview / `quality`, then act on low-coverage/dense pages: `--ocr` for text, `--render` for a vision model, `--layout` for structured/multi-column docs (`--image-boxes` for figure positions).
3. **Zoom a flagged block.** If `warnings[]` fires on a `blockIndex` or a `layout.blocks[i]` looks suspicious, re-run `--pages <N> --render --render-region <x,y,w,h>` — PNG comes back cropped to that region.
4. **Locate a keyword, then zoom.** Run `--search "X" --matches-only` for metadata + flat matches/bboxes, no page bodies (older: omit `--matches-only`, read the `Search matches` table; `-f json` for `pages[N].matches[*]`). Feed a bbox into `--pages <m.page> --render --render-region <x>,<y>,<w>,<h>`. Repeat `--search` for multiple terms.
5. Cache means re-runs only re-pay the new flag combination on affected pages.

## When to read `references/`

Open a reference **only** in these cases — not always-on context, do not load speculatively.

| File | Gate |
|---|---|
| `references/structured-output.md` | **Mandatory** for any structured JSON/XML field whose schema isn't here — `DocumentResult` / `PageResult` / `LayoutBlock` / `PageOcr` / `SearchMatch` / `PageWarning` shapes + coordinate semantics. |
| `references/ocr.md` | **Escalation** for English-only; **mandatory** for non-English text (lang ordering matters), unexpectedly low confidence, or `tesseract.js` install / stderr issues. |
| `references/warnings.md` | **Escalation** when a `warnings[]` code needs more than its inline message; also the raw density thresholds behind `quality`. |
| `references/flags.md` | **Escalation** when choosing between overlapping structural flags for an unusual document; hard-won per-flag caveats. |

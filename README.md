<div align="center">
  <img src="https://raw.githubusercontent.com/yamadashy/pdfvision/main/docs/logo.svg" alt="pdfvision" width="180" />
  <h1>pdfvision</h1>
  <p>
    <b>Give AI agents human-like PDF vision</b>
  </p>
</div>

<hr />

[![npm](https://img.shields.io/npm/v/pdfvision.svg?maxAge=1000)](https://www.npmjs.com/package/pdfvision)
[![npm downloads](https://img.shields.io/npm/dt/pdfvision)](https://www.npmjs.com/package/pdfvision)
[![CI](https://github.com/yamadashy/pdfvision/actions/workflows/ci.yml/badge.svg)](https://github.com/yamadashy/pdfvision/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/yamadashy/pdfvision/graph/badge.svg?token=GUBUU47DW2)](https://codecov.io/gh/yamadashy/pdfvision)
[![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/yamadashy/pdfvision?utm_source=oss&utm_medium=github&utm_campaign=yamadashy%2Fpdfvision&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)](https://coderabbit.ai)
[![License](https://img.shields.io/npm/l/pdfvision)](LICENSE)

🔍 **pdfvision** gives AI agents human-like PDF vision — text, layout, and rendered page images in one pass, delivered as a CLI / library built for agents.

> **Mission: make every PDF reliably readable by AI agents.** Surface text, layout, and page images together, and expose extraction gaps instead of hiding them.

## 💡 Why pdfvision

Hand an agent a PDF and it usually either can't read it at all, or swallows the whole file and blows past its context window. Neither is how anyone actually reads a PDF. A person goes page by page, looks at the figures and images, and zooms in when a detail won't resolve.

**pdfvision gives agents those same eyes.** A lightweight CLI, packed with recognition aids, built specifically so an agent can experiment with *how* it looks at a PDF — one page at a time, as text, as a rendered image, zoomed into a region — instead of being handed a single pre-baked answer it can't second-guess.

### See whether text extraction actually worked

Every page reports `charCount`, `imageCount`, `vectorCount`, `textCoverage`, and `quality.nativeTextStatus`, so an agent can tell at a glance that "this slide is visual, not just text", "this sparse OCR residue is not visible on the rendered page", or "this native text mixes readable words with glyph garbage" — and decide to re-run with `--render` or `--ocr` instead of trusting an empty string or a lone page number.

### Look at the page, not just the text

`--render` hands PNG paths straight to a vision model and `--ocr` attaches per-page OCR alongside the native text, so an agent can read a page visually when the text layer falls short.

### Preserve layout and visual structure

- **`--layout`** returns blocks with `role: 'heading'`, `repeated: true` for running headers and footers, multi-column reading order (including narrow repeated gutters and drop caps), `writingMode: 'vertical'` for detected CJK vertical text stacks, and row-major `layout.tables[]` hints for aligned numeric tables.
- **`--image-boxes`** reports where each raster draw lands.
- **`--vector-boxes`** reports where painted vector paths land, useful for maps, symbols, chart paths, form boxes, table rules, and slide shapes that are visible but not raster images.
- **`--form-fields`** reports interactive PDF widget fields such as text boxes, checkboxes, radio buttons, choices, and signatures with values and bboxes.
- **`--links`** reports clickable PDF link annotations such as citation jumps, table-of-contents destinations, and external URLs with bboxes.
- **`--annotations`** reports non-link PDF annotations such as comments, sticky notes, highlights, underlines, strikeouts, stamps, and other markup with bboxes and comment text.
- **`--outline`** reports document outline/bookmark sidebar entries, preserving hierarchy and resolving destination pages when possible.
- **`--geometry`** emits per-text-item `bbox` + `fontSize` so callers can reconstruct visual hierarchy themselves.

Every page always includes `vectorCount` — the number of non-text vector drawing operations such as rules, form boxes, chart paths, and slide shapes.

The agent picks which signals matter; pdfvision doesn't bake one answer.

### Spot anomalies a human would notice

Each page can carry `pages[].warnings` — overlapping text, body running off the page, collisions with running headers/footers, localized glyph noise (including printable mojibake in CJK text), dense vector graphics such as form boxes or chart paths, numeric tables whose row/column relationships may be flattened, OCR/text layers over full-page scans, or large raster regions whose internal labels will not appear in native text — the "this looks off" cues a text-only extractor silently drops.

### Keep raw evidence available

Normalization is on by default but the pre-normalized text stays in `rawText`, and the `xml` format mirrors `json` as tags some LLMs locate more reliably — the original signal is never thrown away.

### Make repeated agent reads cheap

A cache-first design (~30 ms on the second read) and first-class `--remote` URLs keep the trial-and-error above practical across a whole session.

The design principle is **agent decides; pdfvision delivers raw signals.** No auto-detect heuristics that decide for the agent and hide what the PDF actually contained.

## 🚀 Quick Start

```bash
# Try without installing
npx pdfvision document.pdf

# Render page images for a multimodal LLM
npx pdfvision document.pdf --render

# Pull from a URL
npx pdfvision --remote https://raw.githubusercontent.com/mozilla/pdf.js-sample-files/master/tracemonkey.pdf -f json

# Or install globally
npm install -g pdfvision
pdfvision document.pdf
```

## 🤖 Agent Skill

pdfvision ships a bundled agent skill at [`skills/pdfvision/`](https://github.com/yamadashy/pdfvision/tree/main/skills/pdfvision/) (a `SKILL.md` plus a small `references/` set) so a Claude Code, Codex, or Cursor session knows when to reach for the CLI and how to pick flags. Install it with [`npx skills`](https://github.com/vercel-labs/skills):

```bash
# Project install (default) — drops the skill into <cwd>/.claude/skills/pdfvision/
npx skills add yamadashy/pdfvision

# Global install — drops it into ~/.claude/skills/pdfvision/ instead
npx skills add yamadashy/pdfvision -g
```

The skill covers the daily extraction flow, the density-Overview-based silent-failure detection, and points at `references/structured-output.md` (full `DocumentResult` schema for programmatic consumers) and `references/ocr.md` (multi-language OCR, traineddata, troubleshooting) only when those specific cases apply.

## 📖 Usage

```
pdfvision <file.pdf> [options]
pdfvision --remote <url> [options]
pdfvision --clear-cache

Options:
  -p, --pages <range>     Page range (e.g. "1-5", "3", "1,3,5")
  -f, --format <type>     Output format: markdown (default), json, xml, toon
  -r, --render            Render pages as PNG images
      --render-output <dir>
                          Directory for rendered PNGs (requires --render)
      --render-scale <n>  Rasterisation multiplier (default 2; bounds (0, 4]). Requires --render or --ocr.
      --geometry          Emit per-text-item bbox + font size in pages[].spans (json/xml/toon)
      --layout            Reconstruct lines + blocks + numeric-table hints in pages[].layout;
                          detects CJK vertical text stacks as writingMode='vertical'
                          and uses those recovered blocks in Markdown text;
                          also enables layout warnings (text_overlap / near_bottom_edge /
                          body_near_repeated_chrome / off_page / tabular_numeric_layout)
      --image-boxes       Emit per-image bbox in pages[].imageBoxes;
                          enables large-raster warnings with --layout or --geometry
      --links             Emit clickable link annotations in pages[].links with bboxes
      --annotations       Emit non-link PDF annotations in pages[].annotations
      --outline           Emit document outline/bookmarks in outline
      --ocr               Run tesseract.js OCR; attach pages[].ocr (text/confidence/lang)
      --ocr-lang <lang>   Tesseract lang(s), plus-separated (e.g. eng+jpn). Default: eng
      --remote <url>      Download an http(s) PDF into the cache, validate the PDF header, then extract
      --no-cache          Skip the on-disk cache
      --no-normalize      Disable Unicode NFKC normalization (default: on; pre-normalization text
                          is preserved in JSON/XML \`rawText\` only when normalization changed
                          the string — pass this if you need raw codepoints in markdown too)
      --clear-cache       Wipe every cached extraction, render, and remote download, then exit
  -v, --version           Show version
  -h, --help              Show this help
```

### Output formats

- **`markdown` (default)** — per-page sections, density Overview table, image links inline. For LLM context windows.
- **`json`** — full `DocumentResult` schema. For programmatic consumers.
- **`xml`** — same data as JSON but tag-shaped. For LLMs that locate `<page>` / `<text>` tags more reliably than nested object keys.
- **`toon`** — [Token-Oriented Object Notation](https://toonformat.dev): a lossless, schema-aware encoding of the same `DocumentResult` schema, tuned for LLM token budgets. Uniform object arrays (`overview`, `spans`, `imageBoxes`, `layout` lines) collapse into a CSV-like tabular form that declares field names once instead of repeating them per row, cutting ~40% of tokens versus the pretty-printed JSON on geometry / layout-heavy output (where spans can outnumber the body text 5–10×). On plain text-body extraction the win is smaller since free text doesn't compress. Round-trips back to JSON, so programmatic consumers lose nothing.

### Examples

```bash
# Specific pages as JSON
pdfvision document.pdf -p 1-3 -f json

# Render PNGs into ./images for a multimodal LLM
pdfvision document.pdf -r --render-output ./images

# Layout + image bboxes — agent reconstructs reading order itself.
# pages[].warnings flags overlapping text, body running into the
# bottom edge, body colliding with running headers/footers, localized
# glyph noise / CJK mojibake, dense vector forms/charts,
# OCR/text layers over full-page scans, and large raster
# images whose labels may need vision.
# Pages also expose vectorCount for form boxes, chart paths, and shapes.
pdfvision document.pdf --layout --image-boxes -f json

# Per-text-item geometry (bbox + fontSize per glyph run)
pdfvision document.pdf -f json --geometry

# Same geometry as token-efficient TOON (spans become tabular rows)
pdfvision document.pdf -f toon --geometry

# OCR a scanned PDF (multi-language)
pdfvision scan.pdf --ocr --ocr-lang eng+jpn -f json
```

Coordinates use a **top-down origin** (0,0 at the top-left, y grows downward) in PDF user-space points so callers can overlay spans / image bboxes directly on the rendered PNG. Multiply by `image.width / page.width` to map onto pixels.

## 📚 Library API

```ts
import { processDocument } from 'pdfvision';

const result = await processDocument('./document.pdf', { pages: '1-3', render: true });

console.log(result.totalPages);          // number
console.log(result.metadata.title);      // string | null
for (const page of result.pages) {
  console.log(page.page, page.text);     // typed access, no JSON.parse
  if (page.image) console.log(page.image); // PNG path on disk when render: true
}
```

`processFile()` returns the same string output the CLI prints (`markdown` / `json` / `xml` / `toon`).

Exports: `processDocument`, `processFile`, `parsePageRange`, plus full type definitions for `DocumentResult` / `PageResult` / `PageOverview` / `PageQuality` / `DocumentMetadata` / `ProcessDocumentOptions` / `ProcessOptions` / `OutputFormat` / `TextSpan` / `LayoutBlock` / `LayoutLine` / `LayoutTable` / `LayoutTableRow` / `LayoutTableCell` / `PageLayout` / `ImageBox` / `PageOcr` / `PageWarning`.

## 💾 Caching

Results land under `<os-tmp>/pdfvision/<sha256-prefix>/` keyed by file content. POSIX `0700` / `0600` permissions, symlink/TOCTOU defences. Override the location with `PDFVISION_CACHE_DIR=/path` or wipe everything with `pdfvision --clear-cache`.

Remote downloads must actually return a PDF header. If a `.pdf` URL returns an HTML challenge, landing page, or other non-PDF body, pdfvision fails before caching it and reports the response content type instead of surfacing a later `Invalid PDF structure` parse error.

When `--remote --no-cache` is set, the downloaded PDF is streamed directly into extraction and is not written to the remote-PDF cache.

## 🛠️ Requirements

- Node.js >= 22.13.0
- `@napi-rs/canvas` (installed automatically; ships prebuilt binaries for common platforms)
- `tesseract.js` is installed as an optional dependency and only loaded when `--ocr` is requested. Skip it with `npm install --omit=optional` if you don't need OCR.

## 📜 License

MIT © yamadashy

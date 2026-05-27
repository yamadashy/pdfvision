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

Hand an agent a PDF and it usually either **can't read it at all**, or swallows the whole file and **blows past its context window**. Neither is how anyone actually reads a PDF. A person goes **page by page**, looks at the **figures and images**, and **zooms in** when a detail won't resolve.

**pdfvision gives agents those same eyes.** A lightweight CLI, packed with recognition aids, built specifically so an agent can **experiment with *how* it looks at a PDF** — one page at a time, as text, as a rendered image, zoomed into a region — instead of being handed a single pre-baked answer it can't second-guess.

### See whether text extraction actually worked

Every page reports `charCount`, `imageCount`, and `textCoverage`, so an agent can tell at a glance that "this slide is an image, not text" — and decide to re-run with `--render` or `--ocr` instead of trusting an empty string.

### Look at the page, not just the text

- **`--render`** writes PNG paths the agent can pass straight to a vision model — no second tool, no temp-file plumbing.
- **`--ocr`** runs tesseract.js on each page and attaches `pages[].ocr` (text + confidence + lang) alongside the native pdfjs text — agents diff the two to detect scanned / image-flattened pages without losing the primary signal.

### Preserve layout and visual structure

- **`--layout`** returns blocks with `role: 'heading'`, `repeated: true` for running headers and footers, and multi-column reading order.
- **`--image-boxes`** reports where each raster draw lands.
- **`--geometry`** emits per-text-item `bbox` + `fontSize` so callers can reconstruct visual hierarchy themselves.

The agent picks which signals matter and tries another lens when one falls short; pdfvision doesn't bake one answer.

### Spot anomalies a human would notice

When `--layout` is on, each page also carries `pages[].warnings` — the kind of "this page looks off" signals a human would catch at a glance, but a text-only extractor would silently miss:

- **`text_overlap`** — two text blocks visibly overlap on the page.
- **`near_bottom_edge`** — body text runs into the bottom margin (often a sign of clipped content).
- **`body_near_repeated_chrome`** — body text sits on top of, or right against, a running header / footer.
- **`off_page`** (severity `error`) — a block's bbox lies outside the page's MediaBox.

Each warning carries `code`, `severity` (`warning` | `error`), `message`, and the offending `blockIndex` (plus `otherBlockIndex` where applicable), and is emitted in all four output formats.

### Keep raw evidence available

- Japanese and scientific PDFs full of `⽬` / `Ａ` / `ﬁ` collapse to canonical forms by default. The pre-normalisation text stays available in `rawText` when a diff matters.
- The `xml` format carries the same data as `json` but as `<page>` / `<text>` tags, which some LLMs locate more reliably than nested object keys.

### Make repeated agent reads cheap

- **Cache-first.** Same PDF, second read takes ~30 ms — so the trial-and-error above (re-read this page rendered, now with OCR, now zoomed) stays practical. Agents that revisit a PDF dozens of times across a session pay the parsing cost once.
- **URLs are first-class.** `--remote https://…` downloads, caches, and extracts in one flag.

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
      --layout            Reconstruct lines + blocks (with role / repeated flags) in pages[].layout;
                          also emit pages[].warnings (text_overlap / near_bottom_edge /
                          body_near_repeated_chrome / off_page)
      --image-boxes       Emit per-image bbox in pages[].imageBoxes
      --ocr               Run tesseract.js OCR; attach pages[].ocr (text/confidence/lang)
      --ocr-lang <lang>   Tesseract lang(s), plus-separated (e.g. eng+jpn). Default: eng
      --remote <url>      Download an http(s) PDF into the cache, then extract
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

# Layout + image bboxes — agent reconstructs reading order itself,
# and pages[].warnings flags overlapping text, body running into the
# bottom edge, body colliding with running headers/footers, etc.
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

Exports: `processDocument`, `processFile`, `parsePageRange`, plus full type definitions for `DocumentResult` / `PageResult` / `PageOverview` / `PageQuality` / `DocumentMetadata` / `ProcessDocumentOptions` / `ProcessOptions` / `OutputFormat` / `TextSpan` / `LayoutBlock` / `LayoutLine` / `PageLayout` / `ImageBox` / `PageOcr` / `PageWarning`.

## 💾 Caching

Results land under `<os-tmp>/pdfvision/<sha256-prefix>/` keyed by file content. POSIX `0700` / `0600` permissions, symlink/TOCTOU defences. Override the location with `PDFVISION_CACHE_DIR=/path` or wipe everything with `pdfvision --clear-cache`.

## 🛠️ Requirements

- Node.js >= 22.13.0
- `@napi-rs/canvas` (installed automatically; ships prebuilt binaries for common platforms)
- `tesseract.js` is installed as an optional dependency and only loaded when `--ocr` is requested. Skip it with `npm install --omit=optional` if you don't need OCR.

## 📜 License

MIT © yamadashy

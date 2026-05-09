<div align="center">
  <img src="https://raw.githubusercontent.com/yamadashy/pdfvision/main/docs/logo.svg" alt="pdfvision" width="180" />
  <h1>pdfvision</h1>
  <p>
    <b>Turn any PDF into AI-friendly output</b>
  </p>
</div>

<hr />

[![npm](https://img.shields.io/npm/v/pdfvision.svg?maxAge=1000)](https://www.npmjs.com/package/pdfvision)
[![npm downloads](https://img.shields.io/npm/dt/pdfvision)](https://www.npmjs.com/package/pdfvision)
[![CI](https://github.com/yamadashy/pdfvision/actions/workflows/ci.yml/badge.svg)](https://github.com/yamadashy/pdfvision/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/yamadashy/pdfvision/graph/badge.svg?token=GUBUU47DW2)](https://codecov.io/gh/yamadashy/pdfvision)
[![License](https://img.shields.io/npm/l/pdfvision)](LICENSE)

🔍 **pdfvision** turns any PDF into AI-friendly output — text, metadata, structured layout, and rendered page images — in a single CLI / library built for agents.

> **Mission: any PDF, read accurately by an AI agent.** No silent gaps, no "looks fine but the body was an image" failures.

## 💡 Why pdfvision

PDF tooling has historically been built for humans copying text into a document. Agents need different things: to know whether the extraction actually captured the content, to hand visual pages to a vision model in the same step, and to receive raw structural signals rather than one pre-formatted answer they can't second-guess.

pdfvision is built around that gap. The goal is to **deliver every signal a PDF carries, in a form the agent can act on, and never silently hide that the extraction came up short.**

- **Silent-failure visibility.** Every page reports `charCount`, `imageCount`, and `textCoverage`, so an agent can tell at a glance that "this slide is an image, not text" — and decide to re-run with `--render` or fall back to OCR instead of trusting an empty string.
- **Multimodal handoff in one step.** `--render` writes PNG paths the agent can pass straight to a vision model — no second tool, no temp-file plumbing.
- **Raw structural signals.** `--layout` returns blocks with `role: 'heading'`, `repeated: true` for running headers and footers, and multi-column reading order. `--image-boxes` reports where each raster draw lands. The agent picks which signals matter; pdfvision doesn't bake one answer.
- **Compatibility codepoints handled.** Japanese and scientific PDFs full of `⽬` / `Ａ` / `ﬁ` collapse to canonical forms by default. The pre-normalisation text stays available in `rawText` when a diff matters.
- **Cache-first.** Same PDF, second read takes ~30 ms. Agents that revisit a PDF dozens of times across a session pay the parsing cost once.
- **URLs are first-class.** `--remote https://…` downloads, caches, and extracts in one flag.
- **Tag-shaped output too.** The `xml` format carries the same data as `json` but as `<page>` / `<text>` tags, which some LLMs locate more reliably than nested object keys.

The design principle is **agent decides; pdfvision delivers raw signals.** No auto-detect heuristics that decide for the agent and hide what the PDF actually contained.

## 🚀 Quick Start

```bash
# Try without installing
npx pdfvision document.pdf

# Pull from a URL
npx pdfvision --remote https://example.com/paper.pdf -f json

# Or install globally
npm install -g pdfvision
pdfvision document.pdf
```

## Usage

```
pdfvision <file.pdf> [options]
pdfvision --remote <url> [options]
pdfvision --clear-cache

Options:
  -p, --pages <range>     Page range (e.g. "1-5", "3", "1,3,5")
  -f, --format <type>     Output format: markdown (default), json, xml
  -r, --render            Render pages as PNG images
      --render-output <dir>
                          Directory for rendered PNGs (requires --render)
      --geometry          Emit per-text-item bbox + font size in pages[].spans (json/xml)
      --layout            Reconstruct lines + blocks (with role / repeated flags) in pages[].layout
      --image-boxes       Emit per-image bbox in pages[].imageBoxes
      --remote <url>      Download an http(s) PDF into the cache, then extract
      --no-cache          Skip the on-disk cache
      --no-normalize      Disable Unicode NFKC normalization (default: on)
      --clear-cache       Wipe every cached extraction, render, and remote download, then exit
  -v, --version           Show version
  -h, --help              Show this help
```

### Output formats

- **`markdown` (default)** — per-page sections, density Overview table, image links inline. For LLM context windows.
- **`json`** — full `DocumentResult` schema. For programmatic consumers.
- **`xml`** — same data as JSON but tag-shaped. For LLMs that locate `<page>` / `<text>` tags more reliably than nested object keys.

### Examples

```bash
# Specific pages as JSON
pdfvision document.pdf -p 1-3 -f json

# Render PNGs into ./images for a multimodal LLM
pdfvision document.pdf -r --render-output ./images

# Layout + image bboxes — agent reconstructs reading order itself
pdfvision document.pdf --layout --image-boxes -f json

# Per-text-item geometry (bbox + fontSize per glyph run)
pdfvision document.pdf -f json --geometry
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

`processFile()` returns the same string output the CLI prints (`markdown` / `json` / `xml`).

Exports: `processDocument`, `processFile`, `parsePageRange`, `renderPage`, `renderPages`, `getCacheDir`, `getCached`, `setCache`, plus full type definitions for `DocumentResult` / `PageResult` / `PageOverview` / `DocumentMetadata` / `ProcessDocumentOptions` / `ProcessOptions` / `OutputFormat` / `TextSpan` / `LayoutBlock` / `LayoutLine` / `PageLayout` / `ImageBox`.

## Caching

Results land under `<os-tmp>/pdfvision/<sha256-prefix>/` keyed by file content. POSIX `0700` / `0600` permissions, symlink/TOCTOU defences. Override the location with `PDFVISION_CACHE_DIR=/path` or wipe everything with `pdfvision --clear-cache`.

## 🛠️ Requirements

- Node.js >= 22.13.0
- `@napi-rs/canvas` (installed automatically; ships prebuilt binaries for common platforms)

## 📜 License

MIT © yamadashy

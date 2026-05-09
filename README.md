<div align="center">
  <img src="https://raw.githubusercontent.com/yamadashy/pdfvision/main/docs/logo.svg" alt="pdfvision" width="180" />
  <h1>pdfvision</h1>
  <p>
    <b>See PDFs the way AI agents need them — text, metadata, and page images, in one command.</b>
  </p>
</div>

<hr />

[![npm](https://img.shields.io/npm/v/pdfvision.svg?maxAge=1000)](https://www.npmjs.com/package/pdfvision)
[![npm downloads](https://img.shields.io/npm/dt/pdfvision)](https://www.npmjs.com/package/pdfvision)
[![CI](https://github.com/yamadashy/pdfvision/actions/workflows/ci.yml/badge.svg)](https://github.com/yamadashy/pdfvision/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/yamadashy/pdfvision/graph/badge.svg?token=GUBUU47DW2)](https://codecov.io/gh/yamadashy/pdfvision)
[![License](https://img.shields.io/npm/l/pdfvision)](LICENSE)

🔍 **pdfvision** is a CLI and library that turns PDFs into AI-friendly output.
It extracts text with original line breaks, pulls out metadata, and — when you need it — renders each page to a PNG so multimodal LLMs (Claude, GPT-4o, Gemini, ...) can _see_ the document, not just read it.

It's the missing piece between "I have a PDF" and "my AI agent can use it."

> **Mission: any PDF, read accurately by an AI agent.**
> Native text PDFs, slide decks with rasterised content, scanned reports, multi-column papers — pdfvision aims to deliver every piece of information a PDF carries to the agent, in a form the agent can actually use. No silent gaps, no "looks fine but the body was an image" failures.

## 🌟 Features

- 📄 **Text extraction** with line breaks preserved (via [pdfjs-dist](https://github.com/mozilla/pdf.js))
- 🌏 **Unicode NFKC normalization** by default, so compatibility codepoints (`⽬`, `Ａ`, `ｶﾅ`, `ﬁ`) collapse to canonical forms. Pre-normalization text surfaces in `rawText` when it differs.
- 🏷️ **Metadata extraction** (title, author, subject, creator)
- 🎯 **Page range selection** (`1-5`, `3`, `1,3,5`)
- 🖼️ **Page rendering** to PNG (`--render`) for multimodal LLMs
- 📐 **Per-text-item geometry** (`--geometry`) emits `spans[]` with bbox + font size in top-down coords, so agents can reconstruct headings, tables, and reading order
- 🧱 **Layout reconstruction** (`--layout`) groups spans into lines and blocks (approximate reading order), and **image bboxes** (`--image-boxes`) report where each raster draw lands on the page
- 📦 **Output formats**: agent-friendly `markdown` (default), structured `json`, and tag-shaped `xml`, each with a top-level density Overview for multi-page docs
- ⚡ **Cache-first**: same PDF is parsed once, then served instantly from a `pdfvision/<hash>/` directory under the OS temp dir
- 🛡️ **Hardened cache**: content-addressed, POSIX `0700/0600` permissions, symlink/TOCTOU defences
- 🪶 **Small & fast**: ~11 KB tarball, ~30 ms warm startup for `--help`/`--version`
- 🔧 **Library API too**: structured `processDocument()` returns a typed `DocumentResult` directly

## 🚀 Quick Start

Run instantly without installing anything:

```bash
npx pdfvision document.pdf
```

Or install globally:

```bash
# Install
npm install -g pdfvision

# Then run anywhere
pdfvision document.pdf
```

## Usage

```
pdfvision <file.pdf> [options]

Options:
  -p, --pages <range>     Page range (e.g. "1-5", "3", "1,3,5")
  -f, --format <type>     Output format: markdown (default), json, xml
  -r, --render            Render pages as PNG images
      --render-output <dir>
                          Directory for rendered PNGs (requires --render).
      --no-cache          Skip cache
      --no-normalize      Disable Unicode NFKC normalization (default: on)
      --layout            Reconstruct lines + blocks in pages[].layout
      --image-boxes       Emit per-image bbox in pages[].imageBoxes
      --geometry          Emit per-text-item bbox + font size in pages[].spans.
                          Surfaced in json / xml output; ignored by markdown.
  -v, --version           Show version
  -h, --help              Show this help
```

### Output formats

- **`markdown` (default)** — agent-friendly. Each page becomes a `## Page N` section with a density Overview table at the top and rendered image links inline. Best for handing PDFs to an LLM in a chat / IDE / notebook context.
- **`json`** — programmatic. Full `DocumentResult` schema, including `width`/`height`, `rawText` (when normalization changed text), `overview` (multi-page docs), and `spans[]` (when `--geometry` is on). Best when another tool will parse the output.
- **`xml`** — LLM-friendly tag variant of `json`. Same fields, but as `<document>`/`<page>`/`<text>`/`<spans>` tags that LLMs locate more reliably than nested object keys. Useful when feeding output into a vision/chat model that doesn't always parse JSON faithfully.

### Layout / image bboxes

`--layout` and `--image-boxes` are independent opt-ins that surface in `json` and `xml` output. Layout reconstructs `pages[].layout = { blocks: [{ text, x, y, width, height, lines: [...] }] }` from spans (line clustering by y, block clustering by gap and font size); the block array is in approximate top-down reading order. Image bboxes emit `pages[].imageBoxes` — one entry per raster draw, in the same top-down coordinate system as spans, so an agent can ask "what got rasterised on this page" without having to render the whole page.

### Examples

```bash
# Extract all text
pdfvision document.pdf

# Extract specific pages
pdfvision document.pdf -p 1-3
pdfvision document.pdf -p 1,3,5

# Render pages as PNG (paths are returned in the output)
pdfvision document.pdf -r -p 1-5

# Markdown is the default — each page becomes ## Page N with a density Overview and image links
pdfvision document.pdf

# Switch to JSON for programmatic consumers
pdfvision document.pdf -f json

# XML-flavoured output for LLMs that parse tags more reliably than JSON
pdfvision document.pdf -f xml

# Emit per-text-item geometry (bbox + font size) for layout analysis
pdfvision document.pdf -f json --geometry
```

### Geometry / coordinates

`--geometry` adds `pages[].spans` to the JSON output. Each entry is one
`pdfjs` text run:

```json
{
  "text": "Hello pdfvision",
  "x": 100, "y": 68, "width": 156.05, "height": 24,
  "fontSize": 24,
  "fontName": "g_d0_f1"
}
```

Coordinates use a **top-down origin** (0,0 at the top-left, y grows
downward) in PDF user-space points. This matches the rendered PNG
orientation, so callers can overlay spans directly. Note that the
rendered PNG is produced at a higher pixel density than the PDF page —
multiply span coordinates by `image.width / page.width` (and the same
for height) to map onto pixels. Whitespace-only items are filtered out;
the aggregate `text` field still contains all spaces.

### Caching

Results are cached under `<os-tmp>/pdfvision/<sha256-prefix>/` keyed by file content
(e.g. `/tmp/pdfvision/...` on Linux, `/var/folders/.../T/pdfvision/...` on macOS).
The cache key further factors in the page range and render flag, so different
invocations on the same PDF stay independent. The cached payload is the
structured result, so switching `--format text` ↔ `--format json` between runs
reuses the cache. On POSIX systems, cache directories are created with mode `0700` and
files with `0600` so other local users can't read your extracted text
or images. Windows doesn't honour those mode bits — if multi-user
isolation matters there, restrict NTFS ACLs on the cache root yourself,
or pass `--no-cache`. `--no-cache` bypasses the cache entirely.

## 💡 Why pdfvision

Most PDF CLIs are built for humans. pdfvision is built for AI agents, with one simple goal: **any PDF, read accurately**.

- **Structured output** that LLMs can consume directly (JSON or annotated text)
- **Multimodal-ready**: `--render` produces PNGs so visual information (charts, layouts, scanned pages) can be passed to vision-capable models
- **Per-page density signal**: every page reports `chars`, `images`, and `coverage` so agents can detect "looks fine but the real content was rasterised" pages and re-extract with `--render`
- **Re-read friendly**: agents often inspect the same PDF many times — the cache keeps the second read instant

## 📚 Library API

The recommended entry point for library consumers is **`processDocument()`**,
which returns a typed `DocumentResult` directly. Use it when you want to
walk pages, inspect metadata, or feed data into your own pipeline:

```ts
import { processDocument } from 'pdfvision';

const result = await processDocument('./document.pdf', { pages: '1-3', render: true });

console.log(result.totalPages);          // number
console.log(result.metadata.title);      // string | null
for (const page of result.pages) {
  console.log(page.page, page.text);     // typed access, no JSON.parse
  if (page.image) {
    // PNG path on disk, only set when `render: true`
    console.log(page.image);
  }
}
```

If you want the same string output the CLI prints (e.g. to pipe into another
process or a log), use **`processFile()`**:

```ts
import { processFile } from 'pdfvision';

const md = await processFile('./document.pdf', {
  format: 'markdown',       // or 'json' / 'xml'
  noCache: false,
});
```

Exports: `processDocument`, `processFile`, `parsePageRange`, `renderPage`,
`renderPages`, `getCacheDir`, `getCached`, `setCache`, plus the
`DocumentResult` / `PageResult` / `PageOverview` / `DocumentMetadata` /
`ProcessDocumentOptions` / `ProcessOptions` / `OutputFormat` / `TextSpan` types.

## 🛠️ Requirements

- Node.js >= 22.13.0 (matches the floor required by `pdfjs-dist@5.7+`)
- Native dependency: `@napi-rs/canvas` (installed automatically; ships prebuilt binaries for common platforms)

## 📜 License

MIT © yamadashy

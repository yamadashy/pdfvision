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

Hand an agent a PDF and it usually either can't read it at all, or swallows the whole file and blows past its context window. Worse, extraction failures are *silent*: a scanned page comes back empty, a table comes back flattened, glyph garbage comes back looking like words — and the agent trusts all of it.

A person doesn't read a PDF that way. They go page by page, glance at the figures, and zoom in when a detail won't resolve. pdfvision gives agents that same reading loop:

- **Know when the text can't be trusted.** Every page reports coverage stats and `warnings` — glyph garbage, text layers over full-page scans, flattened numeric tables — so the agent catches silent extraction failures instead of shipping them.
- **Look at the page, not just the text.** `--render` hands page PNGs to a vision model, and `--ocr` adds recognized text with word boxes when the text layer falls short.
- **Find, then zoom.** `--search` returns a bounding box for every match; feed it into `--render-region` for a full-resolution crop of exactly the right spot.
- **Keep the structure a text stream drops.** Layout blocks, tables, form fields, links, annotations, and crop-ready figure regions stay addressable (`--layout`, `--visual-regions`, `--form-fields`, …) instead of being flattened into one string.
- **Iterate cheaply.** A cache-first design (~30 ms on the second read) and first-class `--remote` URLs keep this trial-and-error practical across a whole session.

Find-then-zoom in two commands:

```bash
pdfvision paper.pdf --search "BLEU" --json                 # → every match, with its bbox
pdfvision paper.pdf -p 8 -r --render-region 260,55,320,120 # → PNG crop of that exact table
```

One principle holds it together: **the agent decides; pdfvision delivers raw signals.** No auto-detect heuristics that pick an answer for the agent and hide what the PDF actually contained.

## 🚀 Quick Start

```bash
# Try without installing
npx pdfvision document.pdf

# Render page images for a multimodal LLM
npx pdfvision document.pdf --render

# Pull from a URL
npx pdfvision --remote https://raw.githubusercontent.com/mozilla/pdf.js-sample-files/master/tracemonkey.pdf --json

# Or install globally
npm install -g pdfvision
pdfvision document.pdf
```

Full documentation: <https://pdfvision.dev/>

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
      --markdown / --json / --xml / --toon
                          Shortcuts for --format <type>
  -r, --render            Render pages as PNG images
      --render-output <dir>
                          Directory for rendered page or visual-region PNGs
                          (requires --render or --render-visual-regions)
      --render-scale <n>  Rasterisation multiplier (default 2; bounds (0, 4]);
                          OCR keeps at least scale 2 for recognition quality.
                          Requires --render, --render-visual-regions, or --ocr.
      --render-region <x,y,width,height>
                          Render only the given sub-rectangle of a single page
                          (PDF points, top-left origin — same coordinates as
                          search matches, imageBoxes, and layout blocks);
                          composes with --render-scale for a high-res zoom
      --geometry          Emit per-text-item bbox + font size in pages[].spans (json/xml/toon)
      --layout            Reconstruct lines + blocks + numeric-table hints in pages[].layout;
                          detects CJK vertical text stacks as writingMode='vertical'
                          and uses recovered blocks/tables in Markdown text;
                          also enables layout warnings (text_overlap / near_bottom_edge /
                          body_near_repeated_chrome / off_page / tabular_numeric_layout /
                          reading_order_divergence)
      --strip-repeated    Drop running headers / footers / page numbers from the
                          Markdown body (markdown only; requires --layout)
      --image-boxes       Emit per-image bbox in pages[].imageBoxes;
                          enables imageBoxIndex details on large-raster warnings
      --vector-boxes      Emit vector drawing bboxes in pages[].vectorBoxes
      --visual-regions    Emit crop-ready figure/chart/table/form regions in pages[].visualRegions
      --render-visual-regions
                          Render visual region crops to PNG and attach paths,
                          renderContentRatio, and renderedContentBox hints
      --password <value>  Password for encrypted PDFs; never emitted in output
      --password-stdin    Read the encrypted PDF password from piped stdin; falls back to --password if empty
      --form-fields       Emit interactive PDF widget fields, flags, actions, export values, choice options, and labels in pages[].formFields
      --links             Emit clickable link annotations in pages[].links with bboxes and resolved destination pages
      --annotations       Emit non-link PDF annotations, flags, attachments, and shape geometry in pages[].annotations
      --structure         Emit tagged-PDF structure trees in pages[].structure
      --page-labels       Emit viewer page labels in pageLabels and pages[].pageLabel
      --attachments       Emit embedded file attachment metadata in attachments
      --attachment-output <dir>
                          Write embedded attachment files and include attachments[].path
      --outline           Emit document outline/bookmarks, URLs, and actions in outline
      --viewer            Emit viewer settings and JavaScript actions in viewer
      --layers            Emit PDF optional content groups in layers
      --ocr               Run tesseract.js OCR; attach pages[].ocr (text/confidence/lang)
      --ocr-lang <lang>   Tesseract lang(s), plus-separated (e.g. eng+jpn). Default: eng
      --search <query>    Find every occurrence and emit pages[].matches with the bbox
                          of each hit — feed it into --render-region for a visual zoom.
                          Repeatable (--search A --search B); literal, case-insensitive,
                          NFKC-aware by default. Also matches form field values, link
                          targets, visible annotations, and OCR text when --ocr is on
      --search-regex      Treat each --search query as a JavaScript regular expression
      --search-case-sensitive
                          Match case exactly (default: insensitive)
      --remote <url>      Download an http(s) PDF into the cache, validate the PDF header, then extract
      --no-cache          Skip the on-disk cache
      --no-normalize      Disable Unicode NFKC normalization and C0-control cleanup (default: on;
                          pre-normalization text is preserved in JSON/XML \`rawText\` only when
                          normalization changed the string — pass this if you need raw codepoints
                          in markdown too)
      --clear-cache       Wipe every cached extraction, render, and remote download, then exit
  -v, --version           Show version
  -h, --help              Show this help
```

### Output formats

- **`markdown` (default)** — per-page sections, density Overview table, image links inline. For LLM context windows.
- **`json`** — full `DocumentResult` schema. For programmatic consumers.
- **`xml`** — same data as JSON but tag-shaped. For LLMs that locate `<page>` / `<text>` tags more reliably than nested object keys.
- **`toon`** — [Token-Oriented Object Notation](https://toonformat.dev): a lossless, tabular encoding of the same `DocumentResult` schema. Uniform arrays (`spans`, `imageBoxes`, `layout` lines) declare field names once instead of per row, cutting ~40% of tokens versus pretty-printed JSON on geometry / layout-heavy output. Round-trips back to JSON.

### Examples

```bash
# Specific pages as JSON
pdfvision document.pdf -p 1-3 --json

# Render PNGs into ./images for a multimodal LLM
pdfvision document.pdf -r --render-output ./images

# Find every "revenue" with a bbox, then zoom into one hit
pdfvision report.pdf --search "revenue" --json
pdfvision report.pdf -p 3 -r --render-region 100,200,300,150

# Layout + image bboxes — pages[].warnings flags overlapping text,
# glyph garbage, text layers over full-page scans, flattened numeric
# tables, and large raster images whose labels may need vision
pdfvision document.pdf --layout --image-boxes --json

# Markdown without repeated headers / footers / page numbers
pdfvision document.pdf --layout --strip-repeated

# Suggested visual crops as PNGs, without rendering every full page
pdfvision document.pdf --render-visual-regions --render-output ./regions --json

# Per-text-item geometry (bbox + fontSize per glyph run)
pdfvision document.pdf --json --geometry

# Same geometry as token-efficient TOON (spans become tabular rows)
pdfvision document.pdf --toon --geometry

# Open an encrypted PDF when you know the document password
pdfvision encrypted.pdf --password "secret" --json
printf "secret\n" | pdfvision encrypted.pdf --password-stdin --json

# OCR a scanned PDF (multi-language)
pdfvision scan.pdf --ocr --ocr-lang eng+jpn --json
```

Coordinates use a **top-down origin** (0,0 at the top-left, y grows downward) in PDF user-space points. On unrotated pages, multiply by `image.width / page.width` to map spans / image bboxes onto rendered pixels. On rotated pages, `pages[].rotation` gives the clockwise page rotation; bboxes still feed directly into `--render-region`, while full-page PNG overlays should use the rotated PDF viewport transform because the rendered PNG follows the human-visible orientation.

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

Exports: `processDocument`, `processFile`, `parsePageRange`, plus full type definitions for `DocumentResult` / `DocumentMetadata` / `DocumentAttachment` / `DocumentLayerGroup` / `DocumentLayerOrderItem` / `DocumentLayers` / `DocumentLayerUsage` / `DocumentOutlineItem` / `DocumentOutlineTargetType` / `PageResult` / `PageOverview` / `PageQuality` / `PageWarning` / `SearchMatch` / `LayoutBlock` / `LayoutLine` / `LayoutTable` / `LayoutTableRow` / `LayoutTableCell` / `PageLayout` / `ImageBox` / `PageLink` / `PageLinkTarget` / `PageLinkType` / `PageAnnotation` / `PageAnnotationBorder` / `PageAnnotationBox` / `PageAnnotationFileAttachment` / `PageAnnotationFlag` / `PageAnnotationLine` / `PageAnnotationPoint` / `PageStructureContent` / `PageStructureItem` / `PageStructureNode` / `VisualRegion` / `VisualRegionAssociatedText` / `VisualRegionAssociatedTextRelation` / `VisualRegionKind` / `VisualRegionSource` / `VisualRegionSourceType` / `FormField` / `FormFieldChoiceOption` / `FormFieldLabel` / `FormFieldLabelRelation` / `FormFieldType` / `PageOcr` / `OcrWord` / `RenderRegion` / `TextSpan` / `VectorBox` / `OutputFormat` / `ProcessDocumentOptions` / `ProcessOptions`.

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

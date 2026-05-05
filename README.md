# pdfvision

A CLI tool to extract text, metadata, and page images from PDF files — designed for AI agents.

## Features

- **Text extraction** with line breaks preserved
- **Metadata extraction** (title, author, subject, creator)
- **Page range selection** (`1-5`, `3`, `1,3,5`)
- **Page rendering** to PNG (`--render`) for multimodal LLMs
- **Output formats**: human-readable `text` and structured `json`
- **Cache-first**: same PDF is parsed once, then served instantly from a `pdfvision/<hash>/` directory under the OS temp dir

## Quick Start

```bash
npx pdfvision document.pdf
```

## Usage

```
pdfvision <file.pdf> [options]

Options:
  -p, --pages <range>   Page range (e.g. "1-5", "3", "1,3,5")
  -f, --format <type>   Output format: text (default), json
  -r, --render          Render pages as PNG images
      --no-cache        Skip cache
  -v, --version         Show version
  -h, --help            Show this help
```

### Examples

```bash
# Extract all text
pdfvision document.pdf

# Extract specific pages
pdfvision document.pdf -p 1-3
pdfvision document.pdf -p 1,3,5

# Render pages as PNG (paths are returned in the output)
pdfvision document.pdf -r -p 1-5

# Get JSON output
pdfvision document.pdf -f json
```

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

## Why pdfvision

Most PDF CLIs are built for humans. pdfvision is built for AI agents:

- **Structured output** that LLMs can consume directly (JSON or annotated text)
- **Multimodal-ready**: `--render` produces PNGs so visual information (charts, layouts, scanned pages) can be passed to vision-capable models
- **Re-read friendly**: agents often inspect the same PDF many times — the cache keeps the second read instant

## Library API

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

const text = await processFile('./document.pdf', {
  format: 'text',           // or 'json'
  noCache: false,
});
```

Exports: `processDocument`, `processFile`, `parsePageRange`, `renderPage`,
`renderPages`, `getCacheDir`, `getCached`, `setCache`, plus the
`DocumentResult` / `PageResult` / `DocumentMetadata` / `ProcessDocumentOptions` /
`ProcessOptions` / `OutputFormat` types.

## Requirements

- Node.js >= 22.13.0 (matches the floor required by `pdfjs-dist@5.7+`)
- Native dependency: `@napi-rs/canvas` (installed automatically; ships prebuilt binaries for common platforms)

## License

MIT © yamadashy

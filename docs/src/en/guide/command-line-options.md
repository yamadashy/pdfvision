---
title: Command Line Options
description: Complete pdfvision CLI option reference for PDF input, output formats, rendering, OCR, search, layout, metadata, and cache behavior.
---

# Command Line Options

This page groups the CLI flags by task. Run `pdfvision --help` for the exact help text installed in your current version.

## Input

| Option | Purpose |
| --- | --- |
| `<file.pdf>` | Read a local PDF file. |
| `--remote <url>` | Download an HTTP(S) PDF, validate the PDF header, then extract it. Cached unless `--no-cache` is also passed. |
| `-p, --pages <range>` | Extract pages such as `1`, `1-5`, `1,3,5`, or `2-4,7`. Default: all pages. |
| `--password <value>` | Open an encrypted PDF with a password. The password is not emitted in output. |
| `--password-stdin` | Read the encrypted PDF password from piped stdin. Falls back to `--password` if stdin is empty. |

A subcommand is recognized first, before any option parsing, and only as the first argument; arguments passed to one exit `1`. CLI option syntax is parsed next: an unknown option or missing option value exits `1`, even when `--help` is present. After successful parsing, terminal precedence is `--version`, then `--help`, then `--clear-cache`; these skip input and extraction-option semantic checks. Otherwise, pdfvision trims `--remote`. Multiple positional arguments exit `1` before source presence is checked. With at most one positional argument, pdfvision checks for a non-empty positional input or nonblank `--remote` URL and—with neither—prints full usage to stderr and exits `2` before extraction, cache setup, or extraction-option semantic validation. With a usable source, semantic argument failures exit `1`; a cache-clearing failure also exits `1`.

## Output Format

| Option | Purpose |
| --- | --- |
| `-f, --format <type>` | Output `markdown`, `json`, `xml`, or `toon`. Default: `markdown`. |
| `--markdown` | Shortcut for `--format markdown`. |
| `--json` | Shortcut for `--format json`. |
| `--xml` | Shortcut for `--format xml`. |
| `--toon` | Shortcut for `--format toon`. |
| `--no-normalize` | Disable Unicode NFKC normalization. With normalization enabled, JSON/TOON preserve changed text in `pages[].rawText`; XML uses a sibling `<rawText>`. Markdown omits it. |

Format shortcuts are intentionally strict. Passing two different shortcuts, or a shortcut that conflicts with `--format`, is an error.

JSON-style paths below are exact for JSON, decoded TOON, and `processDocument()`. XML maps them to tags/attributes (`page` → `no`, `pageLabel` → `label`, nested `quality` → flat attributes). Page-result rotation remains an attribute, overview rotation is currently omitted, and empty-field presence can differ.

## Rendering

| Option | Purpose |
| --- | --- |
| `-r, --render` | Render each selected page as a PNG and attach the image path to the page result. |
| `--render-output <dir>` | Write rendered page PNGs or visual-region PNGs into a directory. Requires `--render` or `--render-visual-regions`. |
| `--render-scale <n>` | Set rasterization scale for `--render`, `--render-visual-regions`, or `--ocr`. Default: `2`; accepts decimals in `(0, 4]`. OCR uses at least scale 2 for recognition quality. |
| `--render-region <x,y,width,height>` | Render one page sub-rectangle in raw unrotated page-view units. Requires `--render` or `--ocr`, and exactly one selected page. |

Coordinates use a top-left origin: `x` grows right, `y` grows downward. The same raw page-view units are used by layout blocks, image boxes, vector boxes, search matches, and visual regions. Physical points = raw value × `pages[].userUnit` (or 1 when omitted); pixels = raw region × UserUnit × render scale.

## Layout and Visual Structure

| Option | Purpose |
| --- | --- |
| `--geometry` | Emit per-text-item bounding boxes and font size in `pages[].spans`. Structured formats only. |
| `--layout` | Reconstruct lines, blocks, vertical CJK stacks, numeric-table hints, Markdown layout order, and layout warnings. |
| `--image-boxes` | Emit raster image bounding boxes in `pages[].imageBoxes`. |
| `--vector-boxes` | Emit vector drawing boxes in `pages[].vectorBoxes`. |
| `--visual-regions` | Emit crop-ready regions for figures, charts, diagrams, tables, forms, annotations, and raster/vector clusters. |
| `--render-visual-regions` | Render visual-region crops and attach crop paths, content ratios, and tighter rendered content boxes. Implies `--visual-regions`. |
| `--strip-repeated` | Remove repeated headers, footers, and page-number blocks from Markdown. Requires `--layout`; JSON/TOON retain `repeated: true`, and XML uses a `repeated="true"` block attribute. |

## Search

| Option | Purpose |
| --- | --- |
| `--search <query>` | Find occurrences and emit `pages[].matches[]` with page, source, text, query, and bbox evidence. Repeatable. |
| `--search-regex` | Treat each `--search` value as a JavaScript regular expression. |
| `--search-case-sensitive` | Match case exactly. Default search is case-insensitive. |

Search is NFKC-aware by default and can match native text, form-field text, link targets, visible FreeText annotations, and OCR text when `--ocr` is enabled.

## PDF Features

| Option | Purpose |
| --- | --- |
| `--form-fields` | Emit widget fields, flags, actions, export values, choices, values, bboxes, and nearby visible labels. Markdown also renders a form-field table. |
| `--links` | Emit link annotations with bboxes, URLs, named destinations, and resolved destination pages when available. Markdown also renders a links table. |
| `--annotations` | Emit non-link annotations such as comments, highlights, stamps, file attachments, shapes, and ink. |
| `--structure` | Emit tagged-PDF structure trees when the PDF provides them. |
| `--page-labels` | Emit viewer page labels as `pageLabels` / `pages[].pageLabel` in JSON/TOON; XML uses `page` / `label` attributes. |
| `--attachments` | Emit embedded file attachment metadata without embedding file bytes in the structured output. |
| `--attachment-output <dir>` | Write embedded attachment files to disk. Requires `--attachments`. |
| `--outline` | Emit document outline/bookmarks, preserving hierarchy, URLs, actions, and resolved destinations when possible. |
| `--viewer` | Emit viewer settings, open actions, JavaScript actions, permissions, and MarkInfo. |
| `--layers` | Emit optional content groups, visibility states, radio groups, and viewer panel order. |

## OCR

| Option | Purpose |
| --- | --- |
| `--ocr` | Run Tesseract OCR and attach `pages[].ocr` with text, confidence, language, and word boxes. |
| `--ocr-lang <lang>` | Set OCR languages, such as `eng`, `jpn`, or `eng+jpn`. Default: `eng`. |

OCR never replaces `pages[].text`; it is added beside the native text so the agent can compare both signals.

## Cache and Help

| Option | Purpose |
| --- | --- |
| `--no-cache` | Skip extraction and remote-PDF caches. OCR support files still use the validated cache root; renders without `--render-output` use separate OS-temporary paths. |
| `--clear-cache` | Deprecated alias for the `clear-cache` subcommand. It still clears the cache and prints a warning; it is removed in v1.0. |
| `-v, --version` | Print the pdfvision version. |
| `-h, --help` | Print CLI help. |

## Subcommands

Options describe how to read a PDF. Anything that does not read a PDF is a subcommand, recognized only as the first argument and taking no options of its own beyond `--help`. `--help` and `--version` are the usual exceptions and work anywhere.

| Subcommand | Purpose |
| --- | --- |
| `clear-cache` | Clear the configured cache root only after verifying its pdfvision ownership marker, then exit. Unsafe, broad, unmarked custom, or otherwise unverified roots are refused. |
| `mcp` | Serve pdfvision over the Model Context Protocol on stdio. See [MCP Server](./mcp-server.md). |

A file actually named `mcp` or `clear-cache` must be passed as `./mcp` or `./clear-cache`. Because clearing is destructive, `clear-cache` refuses with exit code `1` instead of guessing when such a file exists in the working directory.

## Exit Codes

| Code | Meaning |
| --- | --- |
| `0` | Success, including `--help`, `--version`, and a successful `clear-cache`. |
| `1` | Option-syntax error; multiple positional arguments; semantic argument failure with a usable source; file, network, cache, clear-cache, or extraction failure. The error message is printed to stderr. |
| `2` | With at most one positional argument, no non-empty positional input or nonblank `--remote` URL was provided. Full usage is printed to stderr. |

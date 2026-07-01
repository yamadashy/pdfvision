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

## Output Format

| Option | Purpose |
| --- | --- |
| `-f, --format <type>` | Output `markdown`, `json`, `xml`, or `toon`. Default: `markdown`. |
| `--markdown` | Shortcut for `--format markdown`. |
| `--json` | Shortcut for `--format json`. |
| `--xml` | Shortcut for `--format xml`. |
| `--toon` | Shortcut for `--format toon`. |
| `--no-normalize` | Disable Unicode NFKC normalization. With normalization enabled, JSON and XML preserve changed pre-normalization text in `rawText`. |

Format shortcuts are intentionally strict. Passing two different shortcuts, or a shortcut that conflicts with `--format`, is an error.

## Rendering

| Option | Purpose |
| --- | --- |
| `-r, --render` | Render each selected page as a PNG and attach the image path to the page result. |
| `--render-output <dir>` | Write rendered page PNGs or visual-region PNGs into a directory. Requires `--render` or `--render-visual-regions`. |
| `--render-scale <n>` | Set rasterization scale for `--render`, `--render-visual-regions`, or `--ocr`. Default: `2`; accepts decimals in `(0, 4]`. OCR uses at least scale 2 for recognition quality. |
| `--render-region <x,y,width,height>` | Render one page sub-rectangle in PDF points. Requires `--render` or `--ocr`, and `--pages` must resolve to exactly one page. |

Coordinates use a top-left origin: `x` grows right, `y` grows downward. The same coordinate system is used by layout blocks, image boxes, vector boxes, search matches, and visual regions.

## Layout and Visual Structure

| Option | Purpose |
| --- | --- |
| `--geometry` | Emit per-text-item bounding boxes and font size in `pages[].spans`. Structured formats only. |
| `--layout` | Reconstruct lines, blocks, vertical CJK stacks, numeric-table hints, Markdown layout order, and layout warnings. |
| `--image-boxes` | Emit raster image bounding boxes in `pages[].imageBoxes`. |
| `--vector-boxes` | Emit vector drawing boxes in `pages[].vectorBoxes`. |
| `--visual-regions` | Emit crop-ready regions for figures, charts, diagrams, tables, forms, annotations, and raster/vector clusters. |
| `--render-visual-regions` | Render visual-region crops and attach crop paths, content ratios, and tighter rendered content boxes. Implies `--visual-regions`. |
| `--strip-repeated` | Remove repeated headers, footers, and page-number blocks from Markdown output. Requires `--layout`; Markdown only. |

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
| `--page-labels` | Emit viewer page labels in `pageLabels` and `pages[].pageLabel`. |
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
| `--no-cache` | Skip the on-disk extraction cache. With `--remote`, stream the downloaded PDF directly without writing the remote-PDF cache. |
| `--clear-cache` | Wipe cached extractions, rendered PNGs, and remote downloads, then exit. |
| `-v, --version` | Print the pdfvision version. |
| `-h, --help` | Print CLI help. |

## Exit Codes

| Code | Meaning |
| --- | --- |
| `0` | Success. |
| `1` | Argument error, file not found, network error, or extraction failure. The error message is printed to stderr. |

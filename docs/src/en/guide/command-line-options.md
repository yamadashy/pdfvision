---
title: Command Line Options
description: pdfvision CLI options grouped by input, output, layout, rendering, OCR, metadata, and cache behavior.
---

# Command Line Options

This page groups the CLI flags by task. Run `pdfvision --help` for the exact current help text.

## Input

| Option | Purpose |
| --- | --- |
| `<file.pdf>` | Read a local PDF file. |
| `--remote <url>` | Download an HTTP(S) PDF into the cache, validate it, then extract it. |
| `--pages <range>` | Extract a page range such as `1-5`, `3`, or `1,3,5`. |
| `--password <value>` | Open an encrypted PDF with a password. |
| `--password-stdin` | Read an encrypted PDF password from piped stdin, falling back to `--password` if stdin is empty. |

## Output Format

| Option | Purpose |
| --- | --- |
| `--format <type>` | Output `markdown`, `json`, `xml`, or `toon`. |
| `--no-normalize` | Disable Unicode NFKC normalization. JSON and XML preserve changed pre-normalization text in `rawText` when normalization is enabled. |

## Rendering

| Option | Purpose |
| --- | --- |
| `--render` | Render selected pages as PNG files and attach image paths. |
| `--render-output <dir>` | Write rendered PNGs into a specific directory. |
| `--render-scale <n>` | Set rasterization scale. Larger values capture more detail and produce larger images. |
| `--render-region <x,y,width,height>` | Render one page sub-rectangle in PDF points. |

## Layout and Visual Structure

| Option | Purpose |
| --- | --- |
| `--geometry` | Emit per-text-item bounding boxes and font size in `pages[].spans`. |
| `--layout` | Reconstruct lines, blocks, vertical CJK stacks, numeric-table hints, and layout warnings. |
| `--image-boxes` | Emit raster image bounding boxes in `pages[].imageBoxes`. |
| `--vector-boxes` | Emit vector drawing boxes in `pages[].vectorBoxes`. |
| `--visual-regions` | Emit crop-ready regions for figures, charts, diagrams, tables, forms, and raster/vector clusters. |
| `--render-visual-regions` | Render visual region crops and attach crop paths and content boxes. |

## PDF Features

| Option | Purpose |
| --- | --- |
| `--form-fields` | Emit widget fields, flags, actions, export values, choices, and labels. |
| `--links` | Emit link annotations with boxes and resolved destinations. |
| `--annotations` | Emit non-link annotations, flags, attachments, and shape geometry. |
| `--structure` | Emit tagged-PDF structure trees. |
| `--page-labels` | Emit viewer page labels. |
| `--attachments` | Emit embedded file attachment metadata. |
| `--attachment-output <dir>` | Write embedded attachment files and include file paths. |
| `--outline` | Emit document outline, URLs, and actions. |
| `--viewer` | Emit viewer preferences and JavaScript actions. |
| `--layers` | Emit optional content groups and layer order. |

## OCR

| Option | Purpose |
| --- | --- |
| `--ocr` | Run Tesseract OCR and attach `pages[].ocr`. |
| `--ocr-lang <lang>` | Set OCR languages, such as `eng`, `jpn`, or `eng+jpn`. |

## Cache and Help

| Option | Purpose |
| --- | --- |
| `--no-cache` | Skip the on-disk extraction and remote download cache. |
| `--clear-cache` | Wipe cached extractions, renders, and remote downloads, then exit. |
| `--version` | Print the pdfvision version. |
| `--help` | Print CLI help. |

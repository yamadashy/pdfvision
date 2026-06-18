---
title: Structured Output
description: Understand pdfvision DocumentResult, PageResult, overview, quality, layout, OCR, warnings, coordinates, and optional PDF feature fields.
---

# Structured Output

`--format json`, `--format xml`, and `--format toon` expose the same underlying `DocumentResult` data. JSON is easiest for programs, XML is useful for tag-oriented prompts, and TOON is compact for array-heavy output.

## Top-Level Shape

```ts
interface DocumentResult {
  file: string;
  totalPages: number;
  metadata: DocumentMetadata;
  overview?: PageOverview[];
  pages: PageResult[];
}
```

Optional top-level fields appear when requested:

- `pageLabels` with `--page-labels`.
- `attachments` with `--attachments`.
- `outline` with `--outline`.
- `viewer` with `--viewer`.
- `layers` with `--layers`.

## Page Overview

`overview[]` is the first place an agent should look. It summarizes each page with fields such as:

- `charCount`
- `imageCount`
- `vectorCount`
- `textCoverage`
- `nonPrintableRatio`
- `renderContentRatio`
- `quality`
- warning and match counts when available

Use it to detect pages where native text may be empty, sparse, visually contradicted, or glyph-corrupted.

## Page Result

Each `pages[]` entry includes:

- `text` and optional `rawText`.
- page dimensions in PDF points.
- density fields mirrored from the overview.
- optional `image` path when `--render` is used.
- optional `spans`, `layout`, `imageBoxes`, `vectorBoxes`, `visualRegions`, `formFields`, `links`, `annotations`, `structure`, `ocr`, `warnings`, and `matches`.

OCR never overwrites native text. Consumers should compare `page.text` and `page.ocr?.text` and decide which signal is appropriate.

## Quality Fields

`quality.nativeTextStatus` describes the native text layer:

- `ok`
- `mixed_glyph_indices`
- `unusable_glyph_indices`
- `sparse_text_on_blank_visual`
- `sparse_text_with_visual_content`
- `empty_but_visual_content`
- `empty`

`quality.visualStatus` appears when rendering or OCR creates a raster:

- `ok`
- `sparse`
- `blank`

These fields are observations, not commands. The agent decides whether to render, OCR, crop, or trust native text.

## Coordinates

All boxes use PDF user-space points with a top-left origin. `x` grows right and `y` grows downward. This matches rendered PNG orientation and makes `--render-region` straightforward.

## Detailed Schema

The TypeScript package exports the full schema types, including `DocumentResult`, `PageResult`, `PageWarning`, `LayoutBlock`, `LayoutLine`, `TextSpan`, `ImageBox`, `VectorBox`, `VisualRegion`, `FormField`, `PageOcr`, and `ProcessDocumentOptions`.

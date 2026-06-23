---
title: Structured Output
description: Understand pdfvision DocumentResult, PageResult, overview, quality, layout, OCR, warnings, coordinates, and optional PDF feature fields.
---

# Structured Output

`--format json`, `--format xml`, and `--format toon` expose the same underlying `DocumentResult` data. JSON is easiest for programs, XML is useful for tag-oriented prompts, and TOON is compact for array-heavy output.

The schema is designed as an evidence model for agents. It does not only say "here is the text"; it also says how much text was found, what visual material exists, whether the native text looks trustworthy, where evidence appears on the page, and what optional PDF features were present.

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

The overview is especially useful for long documents because it lets the agent choose a small set of pages for deeper inspection. For example:

- a page with low text and high image/vector counts may be a chart, slide, scan, or form.
- a page with warning counts should be verified before summarization.
- a page with search matches can be cropped directly for visual evidence.
- a page with blank or sparse visual status may not be worth OCR escalation.

## Page Result

Each `pages[]` entry includes:

- `text` and optional `rawText`.
- page dimensions in PDF points.
- optional page rotation in degrees when the PDF page is rotated.
- density fields mirrored from the overview.
- optional `image` path when `--render` is used.
- optional `spans`, `layout`, `imageBoxes`, `vectorBoxes`, `visualRegions`, `formFields`, `links`, `annotations`, `structure`, `ocr`, `warnings`, and `matches`.

OCR never overwrites native text. Consumers should compare `page.text` and `page.ocr?.text` and decide which signal is appropriate.

Optional fields are intentionally opt-in. A JSON result from `--layout --form-fields` is different from a result where those flags were not requested. When a feature was requested and no items were found, pdfvision uses empty arrays or null-like shapes where useful so consumers can distinguish "not requested" from "requested and absent".

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

Practical interpretation:

- `ok`: native text is a reasonable first source.
- `mixed_glyph_indices` or `unusable_glyph_indices`: verify with render or OCR before trusting text.
- `sparse_text_with_visual_content`: the page likely contains visual meaning not represented in text.
- `empty_but_visual_content`: render or OCR is probably required.
- `sparse_text_on_blank_visual`: the text layer may contain invisible or non-human-visible residue.
- `visualStatus: "blank"` after rendering means the raster path did not reveal visible content.

## Coordinates

All boxes use PDF user-space points with a top-left origin. `x` grows right and `y` grows downward. `width` / `height` and geometry stay in the page MediaBox coordinate system.

On unrotated pages, this matches the rendered PNG orientation. On rotated pages, `pages[].rotation` carries the clockwise page rotation and rendered PNGs follow the human-visible rotated viewport. Pass bboxes directly to `--render-region`; for full-page PNG overlays, map through the rotated PDF viewport instead of only scaling by `image.width / page.width`.

Coordinate-bearing fields include spans, layout blocks and lines, image boxes, vector boxes, visual regions, form fields, links, annotations, structure references, OCR words, and search matches. This means an agent can move from structured extraction to a visual crop without inventing a new coordinate system.

## Evidence Fields by Task

Use these fields as a mental map:

- Text reading: `pages[].text`, `rawText`, `quality`, `warnings`.
- Layout-sensitive reading: `layout.lines`, `layout.blocks`, `layout.tables`, `spans`.
- Visual inspection: `image`, `renderContentRatio`, `imageBoxes`, `vectorBoxes`, `visualRegions`.
- Scan recovery: `ocr.text`, `ocr.confidence`, `ocr.words`, `quality.visualStatus`.
- Evidence search: `matches[].source`, `matches[].bbox`, `matches[].context`.
- Form analysis: `formFields`, labels, values, selected state, flags, actions.
- Navigation and document features: `pageLabels`, `outline`, `links`, `viewer`, `layers`, `structure`.
- File inventory: `attachments` metadata and optional extracted attachment paths.

For agent workflows, the most important pattern is to preserve the field that led to a conclusion. If a summary depends on a table cell, keep the page number and bbox. If OCR was used, keep confidence and the crop. If a warning changed the extraction strategy, keep the warning code.

## Optional PDF Feature Fields

Many PDFs contain information outside the plain text stream. pdfvision keeps these features opt-in so lightweight extraction stays small, but they are important for documents where the viewer experience carries meaning.

Use `--form-fields` for applications, questionnaires, and government forms. It exposes widget type, value, checked state, choices, flags, export values, actions, bbox, and nearby labels. This is often the only reliable way to distinguish a blank box from a selected checkbox or a visible choice field.

Use `--links` and `--outline` for navigation-heavy documents. Links are page-level annotations with bboxes and targets, while outlines are document-level bookmarks that preserve hierarchy and resolved destinations when available. They are useful for citations, table-of-contents entries, manuals, and reports where "where this points" is part of the evidence.

Use `--annotations` when comments, highlights, stamps, ink, shapes, file-attachment icons, or visible FreeText notes may change the meaning of the page. FreeText annotations are also searched by `--search`, even when annotation output itself is not requested, because they can be visible to a human reader while absent from `pages[].text`.

Use `--viewer`, `--page-labels`, and `--layers` when the PDF's viewer state matters. These fields can show page labels that differ from physical page numbers, open actions, viewer preferences, optional content groups, default layer visibility, and document permission flags. Treat these as observations about the PDF, not instructions to execute or enforce.

Use `--structure` when a tagged PDF may contain accessibility roles, figure alt text, language hints, or logical grouping that visual layout alone does not reveal. Tagged structure is supplied by the PDF author and should be compared with visible page evidence when accuracy matters.

Use `--attachments` for PDFs with an attachment pane, page file-attachment icons, or supplemental files. Structured output includes attachment metadata and size; bytes are written only when `--attachment-output` is explicitly provided. Attachment paths are evidence that files were extracted, not a signal that the files are safe to open.

## Detailed Schema

The TypeScript package exports the full schema types, including `DocumentResult`, `PageResult`, `PageWarning`, `LayoutBlock`, `LayoutLine`, `TextSpan`, `ImageBox`, `VectorBox`, `VisualRegion`, `FormField`, `PageOcr`, and `ProcessDocumentOptions`.

---
title: Search and Region Zoom
description: Use pdfvision to search PDF text, form fields, annotations, and OCR output, then render exact matching regions as PNG crops for AI vision models.
---

# Search and Region Zoom

pdfvision can find text evidence first, then render only the matching region. This is useful when an agent needs to verify a clause, table cell, figure label, form value, or OCR result without sending a full page image to a vision model.

This is one of the most agent-friendly workflows in pdfvision: use text search as a cheap locator, then switch to visual evidence only where it matters.

## Search a PDF

```bash
pdfvision report.pdf --search "revenue" --matches-only --json
```

With `--matches-only`, JSON and TOON emit compact hits in the top-level `matches[]` array without page bodies. Each hit includes its page, `queryIndex` linked to the top-level `queries` array, source, text, optional context, tight `bbox`, and crop-ready `region`. Without `--matches-only`, full JSON and TOON keep hits in `pages[].matches[]` alongside the page payload; those full hits include `bbox`, but not `region`.

Full Markdown output still shows a per-page `Search matches` table when `--search` is used. With `--matches-only`, Markdown becomes a compact flat report, while JSON, XML, or TOON remain the better choice when another tool needs to consume coordinates directly.

If any selected page has a non-default PDF `/UserUnit`, the compact report preserves it as `pageUserUnits: [{ page, userUnit }]` in JSON/TOON, equivalent `<pageUserUnits>` entries in XML, and a `Page UserUnits` summary in Markdown. The metadata is omitted when every selected page uses UserUnit 1.

Compact output still retains optional diagnostics for every selected page with warnings or non-OK native or visual quality, including pages with no hits and searches with zero total results. JSON/TOON expose `pageDiagnostics` with raw quality and complete warnings; XML and Markdown present the same information in compact diagnostic sections. Inspect it before treating a hit or miss as visible evidence. Native quality describes native text only and does not rule out OCR or field hits. When applicable, `unreadableSource` keeps document-wide XFA placeholder scope and recovery guidance; rendering a confirmed XFA placeholder only renders the placeholder, so open it in Adobe Acrobat/Reader instead.

Repeat `--search` to run multiple queries in one pass:

```bash
pdfvision paper.pdf --search "transformer" --search "attention" --json
```

By default, search is literal, case-insensitive, and NFKC-aware. Add regex or exact-case matching only when the task needs it:

```bash
pdfvision report.pdf --search "Q[1-4] revenue" --search-regex --json
pdfvision report.pdf --search "PDF" --search-case-sensitive --json
```

Good search targets include:

- contract clauses and policy terms.
- financial metric labels.
- table row names.
- form values.
- figure captions and chart labels.
- OCR text on scanned pages.
- multilingual terms whose Unicode form may vary.

## What Search Covers

Search can match:

- native PDF text.
- text, choice, checkbox, and radio values from `--form-fields`.
- clickable link targets from `--links`.
- visible FreeText annotation contents from `--annotations`.
- OCR text from `--ocr`, using OCR word boxes when available.

OCR matches that duplicate native, form-field, link, or annotation matches are suppressed so agents do not see the same visible text twice. A link hit is suppressed the same way only when its visible anchor text restates the target, such as a URL printed as itself; a prose anchor that merely shares a word with its target keeps both hits, because the sentence and the target are different evidence.

A native hit's `context` quotes the line as the page body renders it — which matters most for right-to-left scripts, where the reconstruction supplies the word spacing and bracket direction that the raw match text lacks. The quoted line is used only when it clearly is the match's line (it must cover most of the match box and contain the matched string); a hit stitched across lines, or one the reconstruction assigned elsewhere, falls back to the raw span join the context has always been.

The match `source` helps the agent decide how much to trust it:

- `native`: text came from the PDF text layer.
- `formField`: text came from a visible widget value, display value, or checkbox/radio export value.
- `link`: text came from a clickable link target.
- `annotation`: text came from a visible FreeText annotation.
- `ocr`: text came from page pixels and may need confidence review.

For multi-query searches, `queryIndex` lets the caller map each hit back to the repeated `--search` flag that produced it.

## Render the Matching Region

`bbox` locates the matched text itself. The compact hit's `region` optionally expands that box to a detected containing table row or visual line, then adds padding and clamps the result within the page. Without a containing structure, it is the padded match geometry. The crop provides nearby visual evidence, but it does not guarantee that an entire table, all headers, or relevant footnotes are included. Compact search computes this region internally, so it does not need `--layout`.

Choose a compact hit by its `page`, `source`, and `context`, then pass its `region` unchanged. For example, if the chosen hit reports the illustrative values `page: 3` and `region: { x: 120, y: 180, width: 360, height: 140 }`, run:

```bash
pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --json
```

`--render-region` requires exactly one selected page. The region uses raw unrotated page-view units with a top-left origin; compact regions are already clamped, while a custom region must stay within the page bounds. Physical points = raw value × UserUnit; pixels = raw region × UserUnit × render scale. Read UserUnit from `pages[].userUnit` in the full report or the selected page's `pageUserUnits` entry in the compact report (1 when omitted).

Use `--render-scale` when the crop contains small labels, superscripts, dense table cells, or chart legends:

```bash
pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-scale 3 --render-output ./crops --json
```

Start with the emitted `region` unchanged. If the task needs different context, a custom narrower or wider crop remains available within the page bounds.

## Agent Workflow

1. Run `--search "…" --matches-only --json` to locate candidate evidence without page bodies.
2. Inspect top-level `matches[]` and choose the hit with the right page, source, and context.
3. Re-run with exactly that hit's `page` and unchanged `region` in `--pages`, `--render`, and `--render-region`.
4. Ask the vision model to compare the crop against the native text, OCR text, or extracted table data.

For visual regions that are not text-searchable, use [Rendering and OCR](./rendering-and-ocr.md) with `--visual-regions` or `--render-visual-regions`.

## Example: Auditable Claim Check

```bash
pdfvision annual-report.pdf --search "Net sales" --search "Operating income" --matches-only --json
```

An agent can inspect top-level `matches[]`, choose the hit with the right page, source, and context, then pass its `region` to the crop command. No `--layout` flag is needed because compact search computes the region internally. If that selected hit reports the following illustrative page and region, the follow-up is:

```bash
pdfvision annual-report.pdf --pages 42 --render --render-region 72,180,468,180 --render-output ./evidence --json
```

The final answer can cite both extracted text and the rendered evidence region.

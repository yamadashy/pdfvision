---
title: Prompt Examples
description: Prompt templates for using pdfvision output with AI agents to inspect PDFs, verify layout, extract tables, read scans, and analyze forms.
---

# Prompt Examples

Use these prompts after generating Markdown, XML, JSON, or TOON output with pdfvision.

The prompts assume the model should treat pdfvision output as evidence, not as a final answer. In most workflows, the model should decide whether the PDF needs another pass with layout, rendering, OCR, search, or region crops.

## General PDF Triage

```text
Review this pdfvision output page by page.

For each page:
1. Summarize the visible content.
2. Check overview quality fields and warnings before trusting native text.
3. Identify pages that need rendering, OCR, or region-level inspection.
4. Return a concise action plan with the exact pdfvision flags to run next.
```

## Evidence-First Summary

```text
Summarize this PDF using the pdfvision output as evidence.

Rules:
1. Start from overview quality fields and page warnings.
2. Do not summarize pages whose native text is empty, sparse, or glyph-corrupted without saying what evidence is missing.
3. When a conclusion depends on a table, form field, chart, or figure, cite the page and bbox or recommend a crop command.
4. Separate confident text-derived claims from claims that need visual verification.
```

## Layout-Sensitive Extraction

```text
Use the pdfvision layout blocks and warnings to reconstruct the human reading order.

Focus on:
1. Headings and section hierarchy.
2. Multi-column reading order.
3. Tables or form labels whose meaning depends on placement.
4. Any warning that suggests native text order differs from visual order.

Do not rely only on pages[].text when layout warnings are present.
```

## Table Review

```text
Extract the tables from this pdfvision JSON.

For each table:
1. Use pages[].layout.tables when available.
2. Preserve row and column relationships.
3. Flag cells that appear ambiguous or may need a rendered crop.
4. Include page number and bounding box evidence for each table.
```

## Financial Metric Verification

```text
Use this pdfvision output to verify financial metrics.

For each requested metric:
1. Find candidate matches in pages[].matches or layout table labels.
2. Identify the page, row/column context, and bbox evidence.
3. Check warnings for table flattening, reading-order divergence, dense vectors, or raster-only content.
4. If the value is visually encoded or ambiguous, return a pdfvision --render-region command for the smallest useful crop.
5. Do not invent values from nearby text when row or column alignment is unclear.
```

## Scanned Document OCR

```text
Compare native text and OCR text in this pdfvision output.

For each page:
1. Use quality.nativeTextStatus and quality.visualStatus to classify the page.
2. Prefer native text only when it is usable.
3. Prefer OCR only when native text is empty, sparse, or glyph-corrupted.
4. Flag low-confidence OCR or pages that need a higher-resolution render.
```

## Form Analysis

```text
Analyze this PDF form using pdfvision form fields and layout data.

Return:
1. A list of visible fields with labels, values, and field types.
2. Checkbox/radio groups and their selected state.
3. Any hidden, read-only, required, or no-view fields.
4. Fields whose label relationship is ambiguous and should be checked with a crop.
```

## Visual Report Review

```text
Review this visual PDF report using pdfvision output.

Focus on:
1. Pages with high imageCount or vectorCount.
2. pages[].visualRegions and their associated text.
3. Warnings that indicate visual-only labels, dense charts, or sparse native text.
4. The smallest set of region crops needed to verify the important charts, diagrams, or screenshots.

Return the proposed crop commands before making visual claims.
```

## Search-Then-Zoom Evidence Check

```text
Use pages[].matches from this pdfvision JSON to choose the best evidence location.

For each relevant match:
1. Report the page, query, source, matched text, and bbox.
2. Decide whether the match needs visual verification.
3. If it does, return the exact pdfvision command with --pages, --render, and --render-region.
4. After the crop is rendered, compare the crop against native text, OCR text, and nearby layout blocks.
```

## Model-Specific Notes

- Use JSON for tools and agents that need exact fields.
- Use XML when the target model follows explicit tags well.
- Use TOON when structured arrays are large and token budget matters.
- Use Markdown for a human-readable first pass.
- Use rendered crops when a claim depends on the visual page, not only the text layer.

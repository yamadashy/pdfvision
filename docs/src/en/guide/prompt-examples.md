---
title: Prompt Examples
description: Prompt templates for using pdfvision output with AI agents to inspect PDFs, verify layout, extract tables, read scans, and analyze forms.
---

# Prompt Examples

Use these prompts after generating Markdown, XML, JSON, or TOON output with pdfvision.

## General PDF Triage

```text
Review this pdfvision output page by page.

For each page:
1. Summarize the visible content.
2. Check overview quality fields and warnings before trusting native text.
3. Identify pages that need rendering, OCR, or region-level inspection.
4. Return a concise action plan with the exact pdfvision flags to run next.
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

## Model-Specific Notes

- Use JSON for tools and agents that need exact fields.
- Use XML when the target model follows explicit tags well.
- Use TOON when structured arrays are large and token budget matters.
- Use Markdown for a human-readable first pass.

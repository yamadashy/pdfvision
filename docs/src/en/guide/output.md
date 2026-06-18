---
title: Output Formats
description: Choose between pdfvision Markdown, JSON, XML, and TOON output.
---

# Output Formats

pdfvision can emit the same extraction result in several formats.

## Markdown

```bash
pdfvision document.pdf
pdfvision document.pdf --format markdown
```

Markdown is the default. It is optimized for conversational AI context: an overview table, per-page sections, extracted text, warnings, and image links when rendering is enabled.

Use it when a human or chat model will read the output directly.

## JSON

```bash
pdfvision document.pdf --format json
```

JSON exposes the full `DocumentResult` schema and is the best format for tools, agents, tests, and downstream automation.

Use JSON when you need fields such as:

- `pages[].layout`
- `pages[].warnings`
- `pages[].spans`
- `pages[].imageBoxes`
- `pages[].visualRegions`
- `pages[].ocr`
- `outline`, `attachments`, `layers`, and `viewer`

## XML

```bash
pdfvision document.pdf --format xml
```

XML mirrors the JSON data in tag-shaped form. Some LLM prompts locate `<page>`, `<text>`, and `<warning>` tags more reliably than nested JSON keys.

## TOON

```bash
pdfvision document.pdf --format toon
```

TOON is a token-oriented representation of the same structured result. Repeated object arrays such as spans, image boxes, and layout lines are encoded more compactly than pretty JSON.

Use TOON when the PDF has many structured rows and the target model context is tight.

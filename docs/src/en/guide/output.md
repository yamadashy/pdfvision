---
title: Output Formats
description: Choose between pdfvision Markdown, JSON, XML, and TOON output.
---

# Output Formats

pdfvision can emit the same extraction result in several formats.

Choose the format based on who will read the output: a person, an LLM prompt, a tool, or a token-constrained agent loop. The extraction fields are the same underlying evidence; the format changes how that evidence is presented.

## Markdown

```bash
pdfvision document.pdf
pdfvision document.pdf --format markdown
```

Markdown is the default. It is optimized for conversational AI context: an overview table, per-page sections, extracted text, search match tables, warnings, and image links when rendering is enabled.

Use it when a human or chat model will read the output directly.

Markdown is a good first pass when you want a model to reason over the document in a conversation and produce the next set of pdfvision commands.

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

Use JSON when you need to branch programmatically: choose pages to OCR, turn search matches into render regions, store warnings with extraction results, or pass image paths into another tool.

## XML

```bash
pdfvision document.pdf --format xml
```

XML mirrors the JSON data in tag-shaped form. Some LLM prompts locate `<page>`, `<text>`, and `<warning>` tags more reliably than nested JSON keys.

XML is useful when the consumer is an LLM that benefits from explicit boundaries around pages, text, warnings, matches, and layout blocks.

## TOON

```bash
pdfvision document.pdf --format toon
```

TOON is a token-oriented representation of the same structured result. Repeated object arrays such as spans, image boxes, and layout lines are encoded more compactly than pretty JSON.

Use TOON when the PDF has many structured rows and the target model context is tight.

TOON is a good fit for geometry-heavy outputs where JSON key repetition would dominate the prompt. The agent still receives the same evidence, but repeated rows are more compact.

## Practical Defaults

- Use Markdown for a quick human-readable extraction.
- Use JSON for tools and agent controllers.
- Use XML for prompt workflows that benefit from explicit tags.
- Use TOON for large structured outputs in tight context windows.

For debugging and reproducibility, prefer JSON. For direct model reading, choose the representation that your target model follows most reliably.

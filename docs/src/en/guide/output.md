---
title: Output Formats
description: Choose between pdfvision Markdown, JSON, XML, and TOON output.
---

# Output Formats

pdfvision can present the same extraction evidence in several formats, but the serialization contracts differ.

Choose the format based on who will read the output: a person, an LLM prompt, a tool, or a token-constrained agent loop. The extraction fields are the same underlying evidence; the format changes how that evidence is presented.

## Markdown

```bash
pdfvision document.pdf
pdfvision document.pdf --format markdown
```

Markdown is the default. It is optimized for conversational AI context: an overview table, per-page sections, extracted text, layout table sections when `--layout` finds row-major table hints, search match tables, warnings, and image links when rendering is enabled. It deliberately transforms or omits structured fields: `rawText` is omitted, and `--strip-repeated` removes repeated layout blocks from the body.

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

XML is a tag-shaped near-parity presentation projection, not a reversible `DocumentResult` serialization. `page` maps to `no`, `pageLabel` to `label`, and nested `quality` fields are flattened into page attributes. Page-result rotation is an attribute, while overview rotation is currently omitted; empty-field presence can also differ.

`rawText` becomes a sibling `<rawText>` element, `repeated: true` becomes `<block repeated="true">`, and top-level `xfa: true` becomes `<document xfa="true">`.

Use XML when a consumer or prompt is built around explicit `<page>`, `<text>`, `<warning>`, match, and layout-block boundaries.

## TOON

```bash
pdfvision document.pdf --format toon
```

Decoding TOON exactly matches the JSON data model (`JSON.parse(formatJson(result))`), including omission of unset `undefined` fields. Arrays of objects with identical scalar fields can use a tabular form that declares field names once and reduces repeated-key overhead.

Arrays with nested values or entries with differing fields remain in list form.

Consider TOON when eligible uniform arrays dominate the result. Compare the formats on your own documents and in the target model context before choosing one for token-sensitive workflows.

## Practical Defaults

- Use Markdown for a quick human-readable extraction.
- Use JSON for tools and agent controllers.
- Use XML for prompt workflows that benefit from explicit tags.
- Consider TOON when uniform scalar-object arrays dominate, then compare it with JSON on your own documents.

For debugging and reproducibility, prefer JSON. For direct model reading, compare representations with your own documents and target model context.

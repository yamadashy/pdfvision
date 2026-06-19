---
title: Library API
description: Use pdfvision from TypeScript or JavaScript with processDocument and processFile.
---

# Library API

pdfvision can be used as a Node.js library.

Use the library when an application or agent runtime needs typed PDF evidence without shelling out to the CLI. The CLI and library share the same extraction model: native text, page quality, layout, visual evidence, OCR, search matches, warnings, and optional PDF feature fields.

## `processDocument`

```ts
import { processDocument } from 'pdfvision';

const result = await processDocument('./document.pdf', {
  pages: '1-3',
  render: true,
  layout: true,
});

console.log(result.totalPages);

for (const page of result.pages) {
  console.log(page.page, page.text);
  if (page.image) console.log(page.image);
}
```

`processDocument()` returns a typed `DocumentResult` object.

Use it when the caller will inspect fields directly:

- route pages based on `overview[]` and `quality`.
- pass `pages[].image` or visual-region images to a vision model.
- use `matches[].bbox` to request a follow-up crop.
- compare native text and OCR text.
- persist page-level warnings alongside extracted data.

Pass `sourceData` when the PDF bytes already live in memory. The `filePath` argument remains the label shown in `result.file`; pdfvision parses the provided bytes instead of reading that path from disk.

```ts
import { readFile } from 'node:fs/promises';
import { processDocument } from 'pdfvision';

const bytes = await readFile('./document.pdf');
const result = await processDocument('document.pdf', {
  sourceData: bytes,
  layout: true,
});
```

Use `onWarning` to capture non-fatal extraction warnings in application logs or agent traces. Warnings are also represented in page output when they are page-specific.

```ts
const warnings: string[] = [];

const result = await processDocument('./report.pdf', {
  pages: '1-100',
  search: ['revenue', 'operating income'],
  onWarning: (message) => warnings.push(message),
});
```

## `processFile`

```ts
import { processFile } from 'pdfvision';

const markdown = await processFile('./document.pdf', {
  format: 'markdown',
  pages: '1-2',
});
```

`processFile()` returns the same string output the CLI prints for `markdown`, `json`, `xml`, or `toon`.

Use it when you want the formatted representation directly, for example to feed Markdown, XML, or TOON into an LLM context window.

Prefer `processDocument()` when your code needs stable typed fields, coordinates, warnings, or follow-up rendering decisions. Prefer `processFile()` when the formatted text itself is the integration boundary.

## Typical Agent Integration

```ts
import { processDocument } from 'pdfvision';

const firstPass = await processDocument('./report.pdf', {
  search: ['revenue', 'operating income'],
  layout: true,
});

const pagesToRender = firstPass.pages.filter((page) => {
  return page.quality.nativeTextStatus !== 'ok' || page.warnings?.length || page.matches?.length;
});

for (const page of pagesToRender) {
  const rendered = await processDocument('./report.pdf', {
    pages: String(page.page),
    render: true,
    layout: true,
  });
  console.log(rendered.pages[0].image);
}
```

The important idea is to make rendering and OCR conditional. Let the first pass tell your agent which pages or regions deserve a more expensive observation.

For region zoom, pass a bbox from `matches[]`, `layout.blocks[]`, `imageBoxes[]`, `vectorBoxes[]`, or `visualRegions[]` into `renderRegion`. Region rendering requires `render: true` or `ocr: true`, and the `pages` selector must resolve to exactly one page.

```ts
const [match] = firstPass.pages.flatMap((page) => page.matches ?? []);

if (match?.bbox) {
  const zoom = await processDocument('./report.pdf', {
    pages: String(match.page),
    render: true,
    renderRegion: match.bbox,
    renderScale: 3,
  });

  console.log(zoom.pages[0].image);
}
```

## Useful Exports

The package exports parsing helpers and type definitions, including `parsePageRange`, `DocumentResult`, `PageResult`, `PageWarning`, `LayoutBlock`, `TextSpan`, `ImageBox`, `VisualRegion`, `PageOcr`, and `ProcessDocumentOptions`.

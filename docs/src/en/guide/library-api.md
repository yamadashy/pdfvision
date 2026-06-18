---
title: Library API
description: Use pdfvision from TypeScript or JavaScript with processDocument and processFile.
---

# Library API

pdfvision can be used as a Node.js library.

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

## `processFile`

```ts
import { processFile } from 'pdfvision';

const markdown = await processFile('./document.pdf', {
  format: 'markdown',
  pages: '1-2',
});
```

`processFile()` returns the same string output the CLI prints for `markdown`, `json`, `xml`, or `toon`.

## Useful Exports

The package exports parsing helpers and type definitions, including `parsePageRange`, `DocumentResult`, `PageResult`, `PageWarning`, `LayoutBlock`, `TextSpan`, `ImageBox`, `VisualRegion`, `PageOcr`, and `ProcessDocumentOptions`.

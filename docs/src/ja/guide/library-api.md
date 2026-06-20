---
title: ライブラリ API
description: TypeScript または JavaScript から processDocument と processFile を使う方法。
---

# ライブラリ API

pdfvision は Node.js ライブラリとしても使えます。

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

`processDocument()` は型付きの `DocumentResult` を返します。

## `processFile`

```ts
import { processFile } from 'pdfvision';

const markdown = await processFile('./document.pdf', {
  format: 'markdown',
  pages: '1-2',
});
```

`processFile()` は CLI と同じ文字列出力を返します。

## 主な export

`parsePageRange`, `DocumentResult`, `PageResult`, `PageWarning`, `LayoutBlock`, `TextSpan`, `ImageBox`, `VisualRegion`, `PageOcr`, `ProcessDocumentOptions` などを export しています。

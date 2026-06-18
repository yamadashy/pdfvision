---
title: 函式庫 API
description: 在 TypeScript 或 JavaScript 中使用 processDocument 和 processFile。
---

# 函式庫 API

pdfvision 可以作為 Node.js 函式庫使用。

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

`processDocument()` 回傳具型別的 `DocumentResult` 物件。

## `processFile`

```ts
import { processFile } from 'pdfvision';

const markdown = await processFile('./document.pdf', {
  format: 'markdown',
  pages: '1-2',
});
```

`processFile()` 回傳與 CLI 相同的字串輸出。

## 常用匯出

套件匯出 `parsePageRange`、`DocumentResult`、`PageResult`、`PageWarning`、`LayoutBlock`、`TextSpan`、`ImageBox`、`VisualRegion`、`PageOcr`、`ProcessDocumentOptions` 等型別和輔助函式。

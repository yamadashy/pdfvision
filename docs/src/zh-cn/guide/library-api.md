---
title: 库 API
description: 在 TypeScript 或 JavaScript 中使用 processDocument 和 processFile。
---

# 库 API

pdfvision 可以作为 Node.js 库使用。

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

`processDocument()` 返回带类型的 `DocumentResult` 对象。

## `processFile`

```ts
import { processFile } from 'pdfvision';

const markdown = await processFile('./document.pdf', {
  format: 'markdown',
  pages: '1-2',
});
```

`processFile()` 返回与 CLI 相同的字符串输出。

## 常用导出

包导出 `parsePageRange`、`DocumentResult`、`PageResult`、`PageWarning`、`LayoutBlock`、`TextSpan`、`ImageBox`、`VisualRegion`、`PageOcr`、`ProcessDocumentOptions` 等类型和辅助函数。

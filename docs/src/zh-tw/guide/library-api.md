---
title: 函式庫 API
description: 在 TypeScript 或 JavaScript 中使用 processDocument 和 processFile。
---

# 函式庫 API

pdfvision 可以作為 Node.js 函式庫使用。

當應用或代理執行環境需要 typed PDF evidence，而不想 shell out 到 CLI 時使用函式庫。CLI 與函式庫共享同一套擷取模型：原生文字、頁面品質、版面、視覺證據、OCR、搜尋匹配、警告和可選 PDF 功能欄位。

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

當呼叫方會直接檢查欄位時使用它：

- 根據 `overview[]` 和 `quality` 路由頁面。
- 把 `pages[].image` 或 visual-region 圖像傳給視覺模型。
- 使用 `matches[].bbox` 請求後續裁切。
- 比較原生文字和 OCR 文字。
- 將頁面級 warning 與擷取資料一起保存。

當 PDF bytes 已經在記憶體中時，傳入 `sourceData`。`filePath` 參數仍作為 `result.file` 中顯示的標籤；pdfvision 會解析提供的 bytes，而不是從該路徑讀取。

```ts
import { readFile } from 'node:fs/promises';
import { processDocument } from 'pdfvision';

const bytes = await readFile('./document.pdf');
const result = await processDocument('document.pdf', {
  sourceData: bytes,
  layout: true,
});
```

使用 `onWarning` 將非致命擷取警告寫入應用日誌或代理 trace。頁面特定 warning 也會出現在頁面輸出中。

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

`processFile()` 回傳與 CLI 相同的字串輸出。

當你需要直接取得 Markdown、XML 或 TOON 等格式化表示，並把它放進 LLM 上下文時使用。程式需要穩定 typed fields、座標、警告或後續渲染決策時，優先選擇 `processDocument()`；格式化文字本身就是整合邊界時，選擇 `processFile()`。

## 典型代理整合

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

關鍵是讓渲染和 OCR 變成條件操作。讓第一遍告訴代理哪些頁面或區域值得進行更昂貴的觀察。

對 region zoom，可以把 `matches[]`、`layout.blocks[]`、`imageBoxes[]`、`vectorBoxes[]` 或 `visualRegions[]` 中的 bbox 傳給 `renderRegion`。區域渲染需要 `render: true` 或 `ocr: true`，且 `pages` selector 必須只解析到一個頁面。

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

## 常用匯出

套件匯出 `parsePageRange`、`DocumentResult`、`PageResult`、`PageWarning`、`LayoutBlock`、`TextSpan`、`ImageBox`、`VisualRegion`、`PageOcr`、`ProcessDocumentOptions` 等型別和輔助函式。

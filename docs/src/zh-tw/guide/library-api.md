---
title: "函式庫 API"
description: "processDocument() / processFile() 的 Node.js API，以及完整的匯出型別清單。當你要從 Node 處理程序直接呼叫 pdfvision，而不是透過 shell 呼叫 CLI 時使用。"
sourceHash: b120aaaf49ec
---

<!-- Translated from docs/src/en/guide/library-api.md, which is generated from docs/cli-topics/library.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# 函式庫 API

## 函式庫 API（Node.js 使用者）

如果呼叫端本身就是一個 Node.js 處理程序，優先使用函式庫 API，而不是呼叫 CLI：

```ts
import { processDocument } from 'pdfvision';

const result = await processDocument('./doc.pdf', {
  pages: '1-3',
  layout: true,
  imageBoxes: true,
  ocr: true,
  ocrLang: 'eng+jpn',
});

// `result` is a typed DocumentResult — no JSON.parse, no string formatting.
for (const page of result.pages) {
  if (page.ocr) console.log(page.ocr.text);
}
```

`processFile()` 回傳格式化後的字串輸出（`markdown` / `json` / `xml` / `toon`）——與 CLI 針對這些選項印出的字串完全相同（CLI 只是多加了一個結尾換行字元）。`processDocument()` 則直接回傳結構化物件。

## 該用哪一個

`processDocument(filePath, options?)` → `Promise<DocumentResult>`；`processFile(filePath, options)` → `Promise<string>`。兩者的選項集合基本相同，差別在於 `ProcessOptions` 要求必須提供 `format` 與 `noCache`，並額外加上兩個只用於格式化的欄位 `matchesOnly` 與 `stripRepeated`；`ProcessDocumentOptions` 則完全是選用的。

當呼叫端需要讀取欄位時，優先使用 `processDocument()`：例如依 `overview[]` / `quality` 為頁面分流、把 `pages[].image` 或某個視覺區域裁切圖交給視覺模型、把 `matches[].bbox` 餵給後續裁切、比對 `pages[].text` 與 `pages[].ocr.text` 的差異、把 `pages[].warnings` 連同擷取資料一起保存。當格式化後的文字本身就是整合邊界時——例如 Markdown / XML / TOON 直接送進模型的 context window——則優先使用 `processFile()`。

## 已經在記憶體中的位元組資料

`sourceData`（一個 `Uint8Array`）會讓 pdfvision 解析這些位元組資料，而不是從磁碟讀取。`filePath` 仍只作為標籤使用，會原封不動地回傳在 `result.file` 中，因此請傳入有意義的內容——例如 URL、上傳 id 或原始檔名。

```ts
const result = await processDocument('document.pdf', { sourceData: bytes, layout: true });
```

## 警告

`onWarning(message)` 會針對每一個非致命警告呼叫一次（例如頁碼範圍超出文件末尾、達到匹配數量上限、regex 預算超出、渲染輸出路徑衝突）。它預設是 `undefined`，也就是靜默——與 CLI 不同，函式庫呼叫端在 stderr 上不會看到任何內容。特定頁面的警告也會以結構化形式記錄在 `pages[].warnings` 上；`onWarning` 是唯一能看到文件層級警告的方式。警告會與快取結果一起記錄下來，並在之後相同的呼叫中重播，上限為 50 筆，最後一個項目會回報實際的總數。

## 有條件的第二次處理

這是常見代理循環在函式庫層級的樣貌：先用一次低成本的處理階段，決定哪些頁面值得進行成本較高的觀察。

```ts
const first = await processDocument('./report.pdf', { search: ['revenue'], layout: true });

for (const page of first.pages) {
  if (page.quality.nativeTextStatus === 'ok' && !page.warnings && !page.matches?.length) continue;
  const rendered = await processDocument('./report.pdf', { pages: String(page.page), render: true });
  console.log(rendered.pages[0].image);
}
```

來自 `matches[]`、`layout.blocks[]`、`imageBoxes[]`、`vectorBoxes[]` 或 `visualRegions[]` 的任何 bbox，都可以原封不動傳入 `renderRegion`（`{ x, y, width, height }`）；即使匹配是從扁平化清單中取出的，`matches[].page` 仍會帶有頁碼。除非同時設定了 `render: true` 或 `ocr: true`，且 `pages` 解析後恰好對應到一個頁面，否則 `renderRegion` 會拋出例外。

## 匯出項目

整個執行期介面只有三個函式：`processDocument`、`processFile` 與 `parsePageRange(range, totalPages)`。快取內部機制與 pdf.js 層級的渲染器刻意不對外匯出——請改用 `pdfvision clear-cache` 與 `processDocument({ render: true })`。

匯出的型別：`DocumentResult`, `DocumentMetadata`, `DocumentAttachment`, `DocumentLayerGroup`, `DocumentLayerOrderItem`, `DocumentLayers`, `DocumentLayerUsage`, `DocumentOutlineItem`, `DocumentOutlineTargetType`, `DocumentViewerState`, `DocumentOpenAction`, `DocumentPermissions`, `DocumentPermission`, `DocumentMarkInfo`, `JsonScalar`, `JsonValue`, `PageOverview`, `PageResult`, `PageQuality`, `PageWarning`, `SearchMatch`, `LayoutBlock`, `LayoutLine`, `LayoutTable`, `LayoutTableRow`, `LayoutTableCell`, `PageLayout`, `ImageBox`, `VectorBox`, `PageLink`, `PageLinkTarget`, `PageLinkType`, `FormField`, `FormFieldChoiceOption`, `FormFieldLabel`, `FormFieldLabelRelation`, `FormFieldResetFormAction`, `FormFieldType`, `PageAnnotation`, `PageAnnotationBorder`, `PageAnnotationBox`, `PageAnnotationFileAttachment`, `PageAnnotationFlag`, `PageAnnotationLine`, `PageAnnotationPoint`, `PageStructureContent`, `PageStructureItem`, `PageStructureNode`, `PageStructureTable`, `PageStructureTableRow`, `PageStructureTableCell`, `VisualRegion`, `VisualRegionAssociatedText`, `VisualRegionAssociatedTextRelation`, `VisualRegionKind`, `VisualRegionSource`, `VisualRegionSourceType`, `RenderRegion`, `RenderedContentBox`, `TextSpan`, `PageOcr`, `OcrWord`, `OutputFormat`, `ProcessDocumentOptions`, `ProcessOptions`.

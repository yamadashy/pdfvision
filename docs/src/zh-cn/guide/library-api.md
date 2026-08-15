---
title: "库 API"
description: "processDocument() / processFile() Node.js API 以及完整的导出类型列表。适用于从 Node 进程中直接调用 pdfvision，而不是通过 shell 调用 CLI 的场景。"
sourceHash: b120aaaf49ec
---

<!-- Translated from docs/src/en/guide/library-api.md, which is generated from docs/cli-topics/library.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# 库 API

## 库 API（Node.js 调用方）

如果调用方本身就是一个 Node.js 进程，优先使用库 API，而不是调用 CLI：

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

`processFile()` 返回格式化后的字符串输出（`markdown` / `json` / `xml` / `toon`）——与 CLI 在这些选项下打印的字符串完全相同（CLI 只是多加了一个结尾换行符）。`processDocument()` 直接返回结构化对象。

## 如何选择

`processDocument(filePath, options?)` → `Promise<DocumentResult>`；`processFile(filePath, options)` → `Promise<string>`。两者的 options 是同一组字段，区别在于 `ProcessOptions` 要求提供 `format` 和 `noCache`，并额外增加了两个仅用于格式化的字段 `matchesOnly` 和 `stripRepeated`；`ProcessDocumentOptions` 则完全是可选的。

当调用方需要读取字段时，优先使用 `processDocument()`：根据 `overview[]` / `quality` 对页面做路由、把 `pages[].image` 或视觉区域裁剪图交给视觉模型、把 `matches[].bbox` 送入后续裁剪、对比 `pages[].text` 与 `pages[].ocr.text` 的差异、把 `pages[].warnings` 和提取出的数据一起持久化。当格式化后的文本本身就是集成边界时，优先使用 `processFile()`——例如把 Markdown / XML / TOON 直接送进模型的上下文窗口。

## 已经在内存中的字节

`sourceData`（一个 `Uint8Array`）会让 pdfvision 解析这些字节，而不是从磁盘读取。`filePath` 仍只是一个标签，会原样作为 `result.file` 返回，因此传入一些有意义的内容——比如 URL、上传 ID、原始文件名。

```ts
const result = await processDocument('document.pdf', { sourceData: bytes, layout: true });
```

## 警告

`onWarning(message)` 对每条非致命警告调用一次（页码范围超出文档末尾、命中匹配数上限、正则预算超时、render-output 路径冲突）。它默认是 `undefined`，也就是静默的——与 CLI 不同，库调用方在 stderr 上什么都得不到。页面相关的警告也会结构化地记录在 `pages[].warnings` 上；`onWarning` 是查看文档级警告的唯一方式。警告会随缓存结果一起记录，并在之后相同的调用中被重放，上限为 50 条，最后一条会报告真实的总数。

## 条件式二次处理

常见智能体循环在库层面的形态：一次低成本的处理决定哪些页面值得做一次昂贵的观察。

```ts
const first = await processDocument('./report.pdf', { search: ['revenue'], layout: true });

for (const page of first.pages) {
  if (page.quality.nativeTextStatus === 'ok' && !page.warnings && !page.matches?.length) continue;
  const rendered = await processDocument('./report.pdf', { pages: String(page.page), render: true });
  console.log(rendered.pages[0].image);
}
```

来自 `matches[]`、`layout.blocks[]`、`imageBoxes[]`、`vectorBoxes[]` 或 `visualRegions[]` 的任何 bbox 都可以原样传入 `renderRegion`（`{ x, y, width, height }`）；即使某条匹配是从一个扁平化列表中取出的，`matches[].page` 仍携带其页码。除非同时设置了 `render: true` 或 `ocr: true`，且 `pages` 恰好解析为一个页面，否则 `renderRegion` 会抛出异常。

## 导出

整个运行时接口只有三个函数：`processDocument`、`processFile` 和 `parsePageRange(range, totalPages)`。缓存内部实现和 pdf.js 级别的渲染器有意不予导出——请改用 `pdfvision clear-cache` 和 `processDocument({ render: true })`。

导出的类型：`DocumentResult`、`DocumentMetadata`、`DocumentAttachment`、`DocumentLayerGroup`、`DocumentLayerOrderItem`、`DocumentLayers`、`DocumentLayerUsage`、`DocumentOutlineItem`、`DocumentOutlineTargetType`、`DocumentViewerState`、`DocumentOpenAction`、`DocumentPermissions`、`DocumentPermission`、`DocumentMarkInfo`、`JsonScalar`、`JsonValue`、`PageOverview`、`PageResult`、`PageQuality`、`PageWarning`、`SearchMatch`、`LayoutBlock`、`LayoutLine`、`LayoutTable`、`LayoutTableRow`、`LayoutTableCell`、`PageLayout`、`ImageBox`、`VectorBox`、`PageLink`、`PageLinkTarget`、`PageLinkType`、`FormField`、`FormFieldChoiceOption`、`FormFieldLabel`、`FormFieldLabelRelation`、`FormFieldResetFormAction`、`FormFieldType`、`PageAnnotation`、`PageAnnotationBorder`、`PageAnnotationBox`、`PageAnnotationFileAttachment`、`PageAnnotationFlag`、`PageAnnotationLine`、`PageAnnotationPoint`、`PageStructureContent`、`PageStructureItem`、`PageStructureNode`、`PageStructureTable`、`PageStructureTableRow`、`PageStructureTableCell`、`VisualRegion`、`VisualRegionAssociatedText`、`VisualRegionAssociatedTextRelation`、`VisualRegionKind`、`VisualRegionSource`、`VisualRegionSourceType`、`RenderRegion`、`RenderedContentBox`、`TextSpan`、`PageOcr`、`OcrWord`、`OutputFormat`、`ProcessDocumentOptions`、`ProcessOptions`。

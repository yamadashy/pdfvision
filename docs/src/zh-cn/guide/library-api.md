---
title: 库 API
description: 在 TypeScript 或 JavaScript 中使用 processDocument 和 processFile。
---

# 库 API

pdfvision 可以作为 Node.js 库使用。

当应用或智能体运行时需要 typed PDF evidence，而不想 shell out 到 CLI 时使用库。CLI 与库共享同一套提取模型：原生文本、页面质量、布局、视觉证据、OCR、搜索匹配、警告和可选 PDF 功能字段。

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

当调用方会直接检查字段时使用它：

- 根据 `overview[]` 和 `quality` 路由页面。
- 把 `pages[].image` 或 visual-region 图像传给视觉模型。
- 使用 `matches[].bbox` 请求后续裁剪。
- 比较原生文本和 OCR 文本。
- 将页面级 warning 与提取数据一起保存。

当 PDF bytes 已经在内存中时，传入 `sourceData`。`filePath` 参数仍作为 `result.file` 中显示的标签；pdfvision 会解析提供的 bytes，而不是从该路径读取。

```ts
import { readFile } from 'node:fs/promises';
import { processDocument } from 'pdfvision';

const bytes = await readFile('./document.pdf');
const result = await processDocument('document.pdf', {
  sourceData: bytes,
  layout: true,
});
```

使用 `onWarning` 将非致命提取警告写入应用日志或智能体 trace。页面特定 warning 也会出现在页面输出中。

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

`processFile()` 返回与 CLI 相同的字符串输出。

当你需要直接获得 Markdown、XML 或 TOON 等格式化表示，并把它放进 LLM 上下文时使用。代码需要稳定 typed fields、坐标、警告或后续渲染决策时，优先选择 `processDocument()`；格式化文本本身就是集成边界时，选择 `processFile()`。

## 典型智能体集成

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

关键是让渲染和 OCR 变成条件操作。让第一遍告诉智能体哪些页面或区域值得进行更昂贵的观察。

对 region zoom，可以把 `matches[]`、`layout.blocks[]`、`imageBoxes[]`、`vectorBoxes[]` 或 `visualRegions[]` 中的 bbox 传给 `renderRegion`。区域渲染需要 `render: true` 或 `ocr: true`，且 `pages` selector 必须只解析到一个页面。

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

## 常用导出

包导出 `parsePageRange`、`DocumentResult`、`PageResult`、`PageWarning`、`LayoutBlock`、`TextSpan`、`ImageBox`、`VisualRegion`、`PageOcr`、`ProcessDocumentOptions` 等类型和辅助函数。

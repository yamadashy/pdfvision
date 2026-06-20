---
title: 安装
description: 使用 npx、npm 或作为库依赖安装 pdfvision。
---

# 安装

pdfvision 以 npm package 分发。你可以用 `npx` 直接运行，为重复 CLI 使用进行全局安装，或在应用需要 typed PDF evidence 时把它作为依赖添加。

## 要求

pdfvision 需要 Node.js 22.13.0 或更高版本。

渲染使用 `@napi-rs/canvas`。OCR 使用可选依赖 `tesseract.js`，只有在请求 `--ocr` 时才会加载。

请使用较新的 Node.js，因为 pdfvision 依赖 modern ESM、pdf.js、渲染和可选 OCR 依赖。

## 无需安装运行

```bash
npx pdfvision document.pdf
```

适合一次性提取。

适合使用 `npx` 的情况：

- 智能体只需要检查一次 PDF。
- 你想在不修改 project 的情况下使用最新发布版。
- script 可以接受 npm 启动开销。

## 全局安装

```bash
npm install -g pdfvision
pdfvision document.pdf
```

当智能体或本地脚本需要反复调用 pdfvision 时，适合全局安装。

对本地智能体工作流来说，这是最方便的设置，因为每个 shell 都能直接调用 `pdfvision`。

## 作为库安装

```bash
npm install pdfvision
```

```ts
import { processDocument } from 'pdfvision';

const result = await processDocument('./document.pdf', { pages: '1-3', render: true });
console.log(result.totalPages);
```

适合使用库的情况：

- 基于 `overview[]`、`quality` 或 warnings 路由页面。
- 将渲染图像路径传给视觉模型。
- 将 search match boxes 转成后续 render regions。
- 保留 `DocumentResult`、`PageResult` 和可选 PDF 功能字段的 TypeScript 类型。

## 跳过 OCR 依赖

如果不需要 OCR，可以省略可选依赖：

```bash
npm install --omit=optional pdfvision
```

正常安装路径中 `@napi-rs/canvas` 是 core dependency，因此渲染仍可使用。省略可选依赖只会移除 OCR 支持。

## 验证安装

```bash
pdfvision --version
pdfvision --help
```

然后运行一个小提取：

```bash
pdfvision document.pdf --json
```

如果 PDF 是扫描件、视觉型，或异常空白，请继续阅读 [渲染与 OCR](./rendering-and-ocr.md)。

---
title: 安装
description: 使用 npx、npm 或作为库依赖安装 pdfvision。
---

# 安装

## 要求

pdfvision 需要 Node.js 22.13.0 或更高版本。

渲染使用 `@napi-rs/canvas`。OCR 使用可选依赖 `tesseract.js`，只有在请求 `--ocr` 时才会加载。

## 无需安装运行

```bash
npx pdfvision document.pdf
```

适合一次性提取。

## 全局安装

```bash
npm install -g pdfvision
pdfvision document.pdf
```

当智能体或本地脚本需要反复调用 pdfvision 时，适合全局安装。

## 作为库安装

```bash
npm install pdfvision
```

```ts
import { processDocument } from 'pdfvision';

const result = await processDocument('./document.pdf', { pages: '1-3', render: true });
console.log(result.totalPages);
```

## 跳过 OCR 依赖

如果不需要 OCR，可以省略可选依赖：

```bash
npm install --omit=optional pdfvision
```

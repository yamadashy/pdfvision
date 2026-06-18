---
title: 安裝
description: 使用 npx、npm，或作為函式庫相依套件安裝 pdfvision。
---

# 安裝

## 需求

pdfvision 需要 Node.js 22.13.0 或更新版本。

渲染使用 `@napi-rs/canvas`。OCR 使用選用相依套件 `tesseract.js`，只有在指定 `--ocr` 時才會載入。

## 不安裝直接執行

```bash
npx pdfvision document.pdf
```

適合一次性擷取。

## 全域安裝

```bash
npm install -g pdfvision
pdfvision document.pdf
```

當代理或本機腳本需要反覆呼叫 pdfvision 時，適合全域安裝。

## 作為函式庫安裝

```bash
npm install pdfvision
```

```ts
import { processDocument } from 'pdfvision';

const result = await processDocument('./document.pdf', { pages: '1-3', render: true });
console.log(result.totalPages);
```

## 跳過 OCR 相依套件

如果不需要 OCR，可以省略選用相依套件：

```bash
npm install --omit=optional pdfvision
```

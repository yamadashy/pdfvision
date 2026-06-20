---
title: 安裝
description: 使用 npx、npm，或作為函式庫相依套件安裝 pdfvision。
---

# 安裝

pdfvision 以 npm package 分發。你可以用 `npx` 直接執行，為重複 CLI 使用進行全域安裝，或在應用需要 typed PDF evidence 時把它作為相依套件加入。

## 需求

pdfvision 需要 Node.js 22.13.0 或更新版本。

渲染使用 `@napi-rs/canvas`。OCR 使用選用相依套件 `tesseract.js`，只有在指定 `--ocr` 時才會載入。

請使用較新的 Node.js，因為 pdfvision 依賴 modern ESM、pdf.js、渲染和選用 OCR 相依套件。

## 不安裝直接執行

```bash
npx pdfvision document.pdf
```

適合一次性擷取。

適合使用 `npx` 的情況：

- 代理只需要檢查一次 PDF。
- 你想在不修改 project 的情況下使用最新發布版。
- script 可以接受 npm 啟動開銷。

## 全域安裝

```bash
npm install -g pdfvision
pdfvision document.pdf
```

當代理或本機腳本需要反覆呼叫 pdfvision 時，適合全域安裝。

對本機代理工作流程來說，這是最方便的設定，因為每個 shell 都能直接呼叫 `pdfvision`。

## 作為函式庫安裝

```bash
npm install pdfvision
```

```ts
import { processDocument } from 'pdfvision';

const result = await processDocument('./document.pdf', { pages: '1-3', render: true });
console.log(result.totalPages);
```

適合使用函式庫的情況：

- 基於 `overview[]`、`quality` 或 warnings 路由頁面。
- 將渲染影像路徑傳給視覺模型。
- 將 search match boxes 轉成後續 render regions。
- 保留 `DocumentResult`、`PageResult` 和可選 PDF 功能欄位的 TypeScript 型別。

## 跳過 OCR 相依套件

如果不需要 OCR，可以省略選用相依套件：

```bash
npm install --omit=optional pdfvision
```

正常安裝路徑中 `@napi-rs/canvas` 是 core dependency，因此渲染仍可使用。省略選用相依套件只會移除 OCR 支援。

## 驗證安裝

```bash
pdfvision --version
pdfvision --help
```

然後執行一個小擷取：

```bash
pdfvision document.pdf --json
```

如果 PDF 是掃描件、視覺型，或異常空白，請繼續閱讀 [渲染與 OCR](./rendering-and-ocr.md)。

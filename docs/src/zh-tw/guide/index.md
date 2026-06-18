---
title: 快速開始
description: 使用 pdfvision 為 AI 代理擷取 PDF 文字、版面、頁面渲染圖與 OCR 證據。
---

# 快速開始

pdfvision 是面向 AI 代理的 PDF 讀取 CLI 與函式庫。它可以依頁輸出文字、版面、影像、OCR 與警告。

核心原則是：**代理做判斷，pdfvision 提供證據。** 它不只回傳扁平文字流，而是暴露足夠訊號，幫助代理發現原生文字擷取不完整的情況。

## 第一次擷取

```bash
npx pdfvision document.pdf
```

預設輸出 Markdown，其中包含每頁文字與概覽表。概覽表包含字元數、影像數、向量數、文字覆蓋率與原生文字品質等訊號。

如果後續工具或代理要讀取結果，請使用 JSON：

```bash
npx pdfvision document.pdf --format json
```

## 加入視覺證據

當 PDF 是掃描件、投影片、圖表密集或依賴版面時，渲染頁面：

```bash
npx pdfvision document.pdf --render --format json
```

當頁面缺少原生文字層時，使用 OCR：

```bash
npx pdfvision scan.pdf --ocr --ocr-lang eng --format json
```

當閱讀順序、分欄、表格、表單或警告很重要時，重建版面：

```bash
npx pdfvision document.pdf --layout --image-boxes --vector-boxes --format json
```

## 接著閱讀

- [安裝](./installation.md)
- [使用方式](./usage.md)
- [輸出格式](./output.md)
- [版面與警告](./layout-and-warnings.md)

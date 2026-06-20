---
title: 輸出格式
description: 選擇 pdfvision 的 Markdown、JSON、XML 或 TOON 輸出。
---

# 輸出格式

pdfvision 可以用多種格式輸出同一份擷取結果。

## Markdown

```bash
pdfvision document.pdf
pdfvision document.pdf --format markdown
```

Markdown 是預設格式，適合直接交給聊天模型或人閱讀。它包含概覽表、每頁文字、警告，以及啟用渲染時的影像連結。

## JSON

```bash
pdfvision document.pdf --format json
```

JSON 暴露完整的 `DocumentResult` schema，適合工具、代理、測試與下游自動化。

常用欄位包括：

- `pages[].layout`
- `pages[].warnings`
- `pages[].spans`
- `pages[].imageBoxes`
- `pages[].visualRegions`
- `pages[].ocr`
- `outline`, `attachments`, `layers`, `viewer`

## XML

```bash
pdfvision document.pdf --format xml
```

XML 將與 JSON 相同的資料表示為標籤結構。某些 LLM 更容易定位 `<page>`、`<text>` 和 `<warning>` 這類標籤。

## TOON

```bash
pdfvision document.pdf --format toon
```

TOON 是同一結構化結果的 token 友好表示。對 spans、image boxes、layout lines 等重複物件陣列，通常比格式化 JSON 更緊湊。

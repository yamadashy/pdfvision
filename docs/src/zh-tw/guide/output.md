---
title: 輸出格式
description: 選擇 pdfvision 的 Markdown、JSON、XML 或 TOON 輸出。
---

# 輸出格式

pdfvision 可以用多種格式輸出同一份擷取結果。

請根據輸出的讀者選擇格式：人類、LLM prompt、工具，或 token 受限的 agent loop。底層 evidence 欄位相同，格式只改變證據的呈現方式。

## Markdown

```bash
pdfvision document.pdf
pdfvision document.pdf --format markdown
```

Markdown 是預設格式，適合直接交給聊天模型或人閱讀。它包含概覽表、每頁文字、警告，以及啟用渲染時的影像連結。

當人類或 chat model 會直接讀取輸出時使用。它也適合作為第一遍，讓模型在對話中理解文件並產生下一組 pdfvision 命令。

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

當需要程式化分支時使用 JSON：選擇要 OCR 的頁面、把 search matches 轉成 render regions、把 warnings 與擷取結果一起保存，或把影像路徑傳給另一個工具。

## XML

```bash
pdfvision document.pdf --format xml
```

XML 將與 JSON 相同的資料表示為標籤結構。某些 LLM 更容易定位 `<page>`、`<text>` 和 `<warning>` 這類標籤。

當消費者是 LLM，且明確的 page、text、warning、matches、layout blocks 邊界有幫助時使用 XML。

## TOON

```bash
pdfvision document.pdf --format toon
```

TOON 是同一結構化結果的 token 友好表示。對 spans、image boxes、layout lines 等重複物件陣列，通常比格式化 JSON 更緊湊。

TOON 適合 geometry-heavy 輸出，其中 JSON key repetition 會佔據大部分 prompt。代理仍然收到同樣的證據，但重複列更緊湊。

## 實用預設值

- 快速的人類可讀擷取使用 Markdown。
- 工具和 agent controllers 使用 JSON。
- 受益於明確標籤的 prompt workflow 使用 XML。
- 緊張 context window 中的大型結構化輸出使用 TOON。

為了 debugging 和可重現性，優先使用 JSON。直接給模型閱讀時，選擇目標模型最可靠遵循的表示。

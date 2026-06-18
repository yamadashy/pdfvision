---
title: 結構化輸出
description: 理解 pdfvision 的 DocumentResult、PageResult、overview、quality、layout、OCR、warnings、座標和可選 PDF 功能欄位。
---

# 結構化輸出

`--format json`、`--format xml` 和 `--format toon` 暴露同一份 `DocumentResult` 資料。JSON 適合程式，XML 適合標籤導向提示詞，TOON 適合陣列很多且需要節省 token 的輸出。

## 頂層結構

```ts
interface DocumentResult {
  file: string;
  totalPages: number;
  metadata: DocumentMetadata;
  overview?: PageOverview[];
  pages: PageResult[];
}
```

按需出現的頂層欄位包括 `pageLabels`、`attachments`、`outline`、`viewer` 和 `layers`。

## Page Overview

`overview[]` 是代理首先應該檢查的位置。

- `charCount`
- `imageCount`
- `vectorCount`
- `textCoverage`
- `nonPrintableRatio`
- `renderContentRatio`
- `quality`
- warning 和 match 計數

它用於發現原生文字為空、稀疏、與視覺矛盾或字形損壞的頁面。

## Page Result

每個 `pages[]` 項目包含 `text`、`rawText`、頁面尺寸、密度欄位，以及按需出現的 `spans`、`layout`、`imageBoxes`、`vectorBoxes`、`visualRegions`、`formFields`、`links`、`annotations`、`structure`、`ocr`、`warnings` 和 `matches`。

OCR 不會覆蓋原生文字。使用方應比較 `page.text` 與 `page.ocr?.text` 後再選擇。

## 座標

所有 bbox 使用 PDF user-space points，左上角為原點。`x` 向右增加，`y` 向下增加，便於直接用於 `--render-region`。

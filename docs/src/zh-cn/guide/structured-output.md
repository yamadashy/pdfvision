---
title: 结构化输出
description: 理解 pdfvision 的 DocumentResult、PageResult、overview、quality、layout、OCR、warnings、坐标和可选 PDF 功能字段。
---

# 结构化输出

`--format json`、`--format xml` 和 `--format toon` 暴露同一份 `DocumentResult` 数据。JSON 适合程序，XML 适合标签导向提示词，TOON 适合数组很多且需要节省 token 的输出。

## 顶层结构

```ts
interface DocumentResult {
  file: string;
  totalPages: number;
  metadata: DocumentMetadata;
  overview?: PageOverview[];
  pages: PageResult[];
}
```

按需出现的顶层字段包括 `pageLabels`、`attachments`、`outline`、`viewer` 和 `layers`。

## Page Overview

`overview[]` 是智能体首先应该检查的位置。

- `charCount`
- `imageCount`
- `vectorCount`
- `textCoverage`
- `nonPrintableRatio`
- `renderContentRatio`
- `quality`
- warning 和 match 计数

它用于发现原生文本为空、稀疏、与视觉矛盾或字形损坏的页面。

## Page Result

每个 `pages[]` 条目包含 `text`、`rawText`、页面尺寸、密度字段，以及按需出现的 `spans`、`layout`、`imageBoxes`、`vectorBoxes`、`visualRegions`、`formFields`、`links`、`annotations`、`structure`、`ocr`、`warnings` 和 `matches`。

OCR 不会覆盖原生文本。使用方应比较 `page.text` 与 `page.ocr?.text` 后再选择。

## 坐标

所有 bbox 使用 PDF user-space points，左上角为原点。`x` 向右增加，`y` 向下增加，便于直接用于 `--render-region`。

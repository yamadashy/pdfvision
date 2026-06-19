---
title: 使用情境
description: AI 代理讀取論文、投影片、政府表單、掃描 PDF、報告、表格、圖表和多語文件時的 pdfvision 工作流。
---

# 使用情境

當 PDF 需要由 AI 代理檢查，而不是手動複製進提示詞時，pdfvision 很有用。最佳流程取決於 PDF 中包含的證據類型。

## 研究論文

先使用原生文字；當分欄、圖、公式或表格重要時加入版面。

```bash
pdfvision paper.pdf --layout --image-boxes --format json
```

如果需要定位引用詞、公式或主張文字，先用 `--search` 找到候選位置，再用 `--render-region` 產生裁切圖。

## 投影片和報告

投影片通常把含義放在影像、向量形狀和相對位置中。

```bash
pdfvision deck.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

必要時只渲染重要區域：

```bash
pdfvision deck.pdf --render-visual-regions --format json
```

## 政府表單和稅務文件

表單會混合可見標籤、欄位、核取方塊、註解和密集線條。

```bash
pdfvision form.pdf --layout --form-fields --annotations --links --format json
```

## 掃描文件

先用概覽訊號確認原生文字缺失或稀疏，再只對需要的頁面執行 OCR。

```bash
pdfvision scan.pdf --pages 1-5 --ocr --ocr-lang eng --format json
```

## 圖表、示意圖和視覺表格

從視覺結構和區域偵測開始：

```bash
pdfvision report.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

然後只渲染需要檢查的裁切區域：

```bash
pdfvision report.pdf --pages 8 --render --render-region 80,140,430,260 --render-output ./regions
```

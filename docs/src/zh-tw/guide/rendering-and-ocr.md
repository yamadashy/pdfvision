---
title: 渲染與 OCR
description: 使用 pdfvision 渲染整頁、渲染視覺區域，並對掃描 PDF 進行 OCR。
---

# 渲染與 OCR

對於掃描件、投影片、圖表、示意圖、截圖和視覺表單，原生 PDF 文字通常不夠。渲染和 OCR 可以讓頁面可檢查。

## 渲染整頁

```bash
pdfvision document.pdf --render --render-output ./images --format json
```

每個選中頁面都會得到一個影像路徑。渲染影像使用與版面框一致的左上角座標系，便於把 PDF points 映射到像素。

```bash
pdfvision document.pdf --render --render-scale 3
```

較小倍率減少影像大小，較大倍率更適合小標籤和密集圖表。

## 渲染一個區域

```bash
pdfvision document.pdf --pages 2 --render-region 120,180,360,240 --render-output ./regions
```

`--render-region` 使用 PDF points 和左上角原點。它適合放大由版面區塊、影像框或視覺區域定位到的位置。

## 渲染視覺區域

```bash
pdfvision document.pdf --render-visual-regions --render-output ./regions --format json
```

只裁切並渲染圖、圖表、表單、表格與示意圖等重要區域。

## OCR

```bash
pdfvision scan.pdf --ocr --ocr-lang eng --format json
```

OCR 輸出包含文字、信心分數、語言和單字框。

多語言頁面使用 `+` 連接語言：

```bash
pdfvision scan.pdf --ocr --ocr-lang eng+jpn --format json
```

---
title: 渲染与 OCR
description: 使用 pdfvision 渲染整页、渲染视觉区域，并对扫描 PDF 进行 OCR。
---

# 渲染与 OCR

对于扫描件、幻灯片、图表、示意图、截图和视觉表单，原生 PDF 文本通常不够。渲染和 OCR 可以让页面可检查。

## 渲染整页

```bash
pdfvision document.pdf --render --render-output ./images --format json
```

每个选中页面都会得到一个图像路径。渲染图像使用与布局框一致的左上角坐标系，便于把 PDF 点映射到像素。

```bash
pdfvision document.pdf --render --render-scale 3
```

较小倍率减少图像大小，较大倍率更适合小标签和密集图表。

## 渲染一个区域

```bash
pdfvision document.pdf --pages 2 --render --render-region 120,180,360,240 --render-output ./regions
```

`--render-region` 使用 PDF points 和左上角原点。它适合放大由布局块、图像框或视觉区域定位到的位置。

搜索结果的 bbox 也可以使用同一裁剪流程。参见 [搜索与区域放大](./search-and-region-zoom.md)。

## 渲染视觉区域

```bash
pdfvision document.pdf --render-visual-regions --render-output ./regions --format json
```

只裁剪并渲染图、图表、表单、表格和示意图等重要区域。

## OCR

```bash
pdfvision scan.pdf --ocr --ocr-lang eng --format json
```

OCR 输出包含文本、置信度、语言和单词框。

多语言页面使用 `+` 连接语言：

```bash
pdfvision scan.pdf --ocr --ocr-lang eng+jpn --format json
```

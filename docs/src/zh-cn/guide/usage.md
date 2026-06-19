---
title: 使用方法
description: 本地 PDF、远程 PDF、页码范围、渲染、布局、OCR 和加密 PDF 的常见用法。
---

# 使用方法

## 本地 PDF

```bash
pdfvision document.pdf
```

## 远程 PDF

```bash
pdfvision --remote https://example.com/document.pdf --format json
```

远程下载会被缓存，并在提取前验证是否为 PDF。如果 `.pdf` URL 返回 HTML、登录页或挑战页，pdfvision 会在缓存前失败。

## 页码范围

```bash
pdfvision document.pdf --pages 1-3
pdfvision document.pdf --pages 1,3,5 --format json
```

## 渲染页面

```bash
pdfvision document.pdf --render --render-output ./images --format json
```

使用 `--render-scale` 控制图像细节：

```bash
pdfvision document.pdf --render --render-scale 3
```

## 提取布局和视觉结构

```bash
pdfvision document.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

这会添加布局块、图像框、矢量框、视觉区域和布局警告。

## 只渲染重要区域

```bash
pdfvision document.pdf --render-visual-regions --render-output ./regions --format json
```

当不想渲染整页，但需要查看图、表、表单或图表区域时使用。

## 搜索并放大

```bash
pdfvision report.pdf --search "revenue" --format json
pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --format json
```

当 pdfvision 能定位证据时，搜索结果会包含 bbox。把该 bbox 传给 `--render-region`，即可生成用于视觉验证的小裁剪图。

## 扫描页 OCR

```bash
pdfvision scan.pdf --ocr --ocr-lang eng --format json
pdfvision japanese-scan.pdf --ocr --ocr-lang eng+jpn --format json
```

OCR 结果包含文本、置信度、语言和单词框。

## 加密 PDF

```bash
pdfvision encrypted.pdf --password your-password --format json
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```

当密码不应出现在 shell 历史或进程参数中时，优先使用 `--password-stdin`。

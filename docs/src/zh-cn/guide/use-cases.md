---
title: 使用场景
description: AI 智能体读取论文、幻灯片、政府表单、扫描 PDF、报告、表格、图表和多语言文档时的 pdfvision 工作流。
---

# 使用场景

当 PDF 需要由 AI 智能体检查，而不是手动复制进提示词时，pdfvision 很有用。最佳流程取决于 PDF 中包含的证据类型。

## 研究论文

先使用原生文本；当分栏、图、公式或表格重要时加入布局。

```bash
pdfvision paper.pdf --layout --image-boxes --format json
```

## 幻灯片和报告

幻灯片通常把含义放在图像、矢量形状和相对位置中。

```bash
pdfvision deck.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

必要时只渲染重要区域：

```bash
pdfvision deck.pdf --render-visual-regions --format json
```

## 政府表单和税务文档

表单会混合可见标签、字段、复选框、注释和密集线条。

```bash
pdfvision form.pdf --layout --form-fields --annotations --links --format json
```

## 扫描文档

先用概览信号确认原生文本缺失或稀疏，再只对需要的页面运行 OCR。

```bash
pdfvision scan.pdf --pages 1-5 --ocr --ocr-lang eng --format json
```

## 图表、示意图和视觉表格

从视觉结构和区域检测开始：

```bash
pdfvision report.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

然后只渲染需要检查的裁剪区域：

```bash
pdfvision report.pdf --pages 8 --render-region 80,140,430,260 --render-output ./regions
```

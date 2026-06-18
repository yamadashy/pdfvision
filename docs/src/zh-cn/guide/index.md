---
title: 快速开始
description: 使用 pdfvision 为 AI 智能体提取 PDF 文本、布局、页面渲染图和 OCR 证据。
---

# 快速开始

pdfvision 是用于读取 PDF 的 CLI 和库，面向 AI 智能体的工作流设计。它可以按页输出文本、布局、图像、OCR 和警告。

核心原则是：**智能体做判断，pdfvision 提供证据。** 它不只返回扁平文本流，而是暴露足够的信号，帮助智能体发现原生文本提取不完整的情况。

## 第一次提取

```bash
npx pdfvision document.pdf
```

默认输出 Markdown，其中包含每页文本和概览表。概览表包含字符数、图像数、矢量数、文本覆盖率和原生文本质量等信号。

如果后续工具或智能体要读取结果，请使用 JSON：

```bash
npx pdfvision document.pdf --format json
```

## 添加视觉证据

当 PDF 是扫描件、幻灯片、图表密集或依赖布局时，渲染页面：

```bash
npx pdfvision document.pdf --render --format json
```

当页面缺少原生文本层时，使用 OCR：

```bash
npx pdfvision scan.pdf --ocr --ocr-lang eng --format json
```

当阅读顺序、分栏、表格、表单或警告很重要时，重建布局：

```bash
npx pdfvision document.pdf --layout --image-boxes --vector-boxes --format json
```

## 接下来阅读

- [安装](./installation.md)
- [使用方法](./usage.md)
- [输出格式](./output.md)
- [布局与警告](./layout-and-warnings.md)

---
layout: home
title: pdfvision
titleTemplate: 面向 AI 智能体的 PDF 提取
hero:
  name: pdfvision
  text: 让 AI 智能体具备类似人的 PDF 视觉
  tagline: 从 PDF 中提取文本、布局、OCR、元数据和页面渲染图像，让智能体能够检查证据，而不是只依赖单一的扁平文本流。
  image:
    src: /logo.svg
    alt: pdfvision
  actions:
    - theme: brand
      text: 快速开始
      link: /zh-cn/guide/
    - theme: alt
      text: GitHub
      link: https://github.com/yamadashy/pdfvision
features:
  - title: 文本与视觉证据
    details: 将原生文本、密度信号、页面渲染图、OCR 文本和几何信息组合成适合智能体使用的结果。
  - title: 理解布局的提取
    details: 重建行、块、表格、表单标签、注释、链接和视觉区域，同时保留 PDF 的原始信号。
  - title: 可用于决策的警告
    details: 暴露扫描页、乱码字形、被压平的表格、文本重叠、页眉页脚冲突等人类读者会注意到的异常。
---

## 快速开始

无需安装即可运行：

```bash
npx pdfvision document.pdf
```

为多模态模型渲染页面图像：

```bash
npx pdfvision document.pdf --render
```

从 URL 提取结构化 JSON：

```bash
npx pdfvision --remote https://raw.githubusercontent.com/mozilla/pdf.js-sample-files/master/tracemonkey.pdf --format json
```

## 文档

- [快速开始](./guide/) 介绍基本流程。
- [使用场景](./guide/use-cases) 将常见 PDF 类型映射到 pdfvision 命令模式。
- [CLI 选项](./guide/command-line-options) 按任务整理主要参数。
- [结构化输出](./guide/structured-output) 解释智能体和工具会消费的字段。
- [布局与警告](./guide/layout-and-warnings) 解释应从 README 简短介绍中分离出去的视觉结构细节。
- [渲染与 OCR](./guide/rendering-and-ocr) 覆盖图像输出、区域裁剪和扫描文档。
- [搜索与区域放大](./guide/search-and-region-zoom) 展示如何找到文本证据，并只渲染匹配区域。

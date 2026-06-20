---
layout: home
title: pdfvision
titleTemplate: 面向 AI 智能体的 PDF 信号提取
hero:
  name: pdfvision
  text: 让 AI 智能体具备类似人的 PDF 视觉
  tagline: 从 PDF 中提取文本、布局、视觉区域、OCR、元数据、警告和页面渲染图像，让智能体能够检查 PDF 证据，而不是只依赖单一的扁平文本流。
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
  - title: 面向智能体的 PDF 分流
    details: 先读取低成本的原生文本和逐页质量信号，再决定是否需要渲染、OCR、搜索或裁剪。
  - title: 按需提供视觉证据
    details: 渲染整页、精确区域，或生成图、图表、表格、表单、图示候选区域，交给多模态模型检查。
  - title: 布局与警告信号
    details: 保留标题、分栏、表格、表单标签、链接、注释，以及揭示文本提取不完整的警告。
---

## 为什么是 pdfvision

许多 PDF 提取工具只给智能体一段字符串，并要求它信任结果。真实文档中，这种方式很容易失败：双栏论文、含义藏在形状里的幻灯片、带图表和表格的报告、政府表单、带 OCR 残留的扫描件，以及文本层包含兼容字形或乱码的多语言 PDF，都不能只看一条扁平文本流。

pdfvision 围绕一个不同的循环设计：

1. 提取 PDF 的原生信号。
2. 判断这些信号是否可信。
3. 定位真正重要的证据。
4. 只对需要进一步检查的页面或区域进行渲染或 OCR。

这个循环更接近人类阅读 PDF 的方式。你会先浏览页面，注意视觉页面和提取文本是否不一致，放大图表或表单字段，并保留可验证的原始证据。

## 它给智能体什么

pdfvision 在一个 CLI 和 TypeScript 库中组合了智能体需要的 PDF 信号：

- 带 Unicode 规范化的原生文本，以及可选的 raw text。
- 字符数、图像数、矢量数、文本覆盖率、原生文本状态等逐页密度与质量字段。
- 布局块、标题、多栏阅读顺序、竖排 CJK、数字表格提示、重复页眉/页脚检测。
- 面向视觉模型的页面 PNG 与目标区域裁剪。
- 扫描或图像型页面的 OCR 文本、置信度、语言和词级 bbox。
- 横跨原生文本、可见表单值、FreeText 注释和 OCR 输出的搜索匹配与 bbox。
- 用于图、图表、表格、表单和图示裁剪的 raster image box、vector box 和 visual region。
- 按需输出表单字段、链接、注释、目录、页码标签、图层、viewer 设置、结构树和附件元数据。
- 乱码字形、可疑 OCR 层、密集矢量图、被压平的表格、重叠文本、页外内容、隐藏图层风险、阅读顺序分歧等人类会注意到的警告。

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

搜索证据，然后只裁剪匹配区域：

```bash
npx pdfvision report.pdf --search "revenue" --json
npx pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --json
```

不渲染每一整页，也可以检查视觉结构：

```bash
npx pdfvision slides.pdf --layout --image-boxes --vector-boxes --visual-regions --json
npx pdfvision slides.pdf --render-visual-regions --render-output ./regions --json
```

## 文档

- [快速开始](./guide/) 介绍基本流程。
- [使用场景](./guide/use-cases) 将常见 PDF 类型映射到 pdfvision 命令模式。
- [CLI 选项](./guide/command-line-options) 按任务整理主要参数。
- [结构化输出](./guide/structured-output) 解释智能体和工具会消费的字段。
- [布局与警告](./guide/layout-and-warnings) 解释应从 README 简短介绍中分离出去的视觉结构细节。
- [渲染与 OCR](./guide/rendering-and-ocr) 覆盖图像输出、区域裁剪和扫描文档。
- [搜索与区域放大](./guide/search-and-region-zoom) 展示如何找到文本证据，并只渲染匹配区域。

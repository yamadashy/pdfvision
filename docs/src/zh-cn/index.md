---
layout: home
title: pdfvision
titleTemplate: 面向 AI 智能体的 PDF 信号提取
hero:
  name: pdfvision
  text: 让 AI 智能体具备类似人的 PDF 视觉
  tagline: 把 PDF 提取中悄无声息的失败，变成智能体能够补救的错误。只靠提取本身，空白扫描件、乱码字形、错乱的分栏都会作为成功返回——pdfvision 会逐页标记它们，并指出下一步该怎么做：渲染页面、运行 OCR，或只裁剪关键区域。
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
  - title: 先核实，再信任
    details: 每一页返回的不只是文本，还有质量信号。警告会点明具体风险——字形乱码、图像化文本、阅读顺序分歧——并以下一步该做什么收尾。
  - title: 按需逐步使用上下文
    details: 先用低成本的原生文本，再按页缩小长文档的范围，只在信号提示需要细看的地方启用布局、OCR 或渲染。
  - title: 搜索、放大、渲染
    details: 先找到文本证据，再只渲染匹配区域——送进视觉模型的是一张小裁剪图，而不是每一页的图像。
---

## 为什么是 pdfvision

PDF 提取最糟糕的一点是：失败看起来和成功一样。扫描件返回空文本，损坏的字体映射返回看似可读的乱码，双栏论文返回时两栏交错——而它们都会作为一次正常、成功的结果返回。信任了它的智能体会给出错误答案，却始终不知道哪里出了问题。

这个领域的多数工具瞄准的是转换：把 PDF 变成干净的 Markdown，然后期待结果足够忠实。pdfvision 瞄准的是诊断——它标记出提取结果不可信的页面，并在那里取回局部的视觉证据。

它围绕的循环是：

1. 提取 PDF 的原生信号。
2. 判断这些信号是否可信。
3. 定位真正重要的证据。
4. 只对需要进一步检查的页面或区域进行渲染或 OCR。

这个循环更接近人类阅读 PDF 的方式：先浏览页面，注意视觉页面和提取文本何时不一致，再放大决定答案的那张图表或那个表单字段。

## 它给智能体什么

- **每一页都有质量信号。** 字符数、图像数、矢量数、文本覆盖率、原生文本状态，以及针对人类会注意到的线索给出的警告——每条警告都以补救办法收尾，因此智能体无需理解字体映射或内容流。
- **只在重要的地方取证据。** 可横跨原生文本、表单值、注释、链接和 OCR 输出搜索；每条匹配都带页码和 bbox，可直接裁剪并渲染。
- **智能体能直接使用的结构化输出。** JSON、Markdown、TOON 和 XML，包含布局块、表单字段、链接、目录和附件——都是按需开启，因此默认调用保持轻量。

布局重建、OCR、visual region 等其余能力在[指南](./guide/)中介绍。

## 快速开始

无需安装即可运行：

```bash
npx pdfvision document.pdf
```

提取出问题时，页面自己会说出来。下面的例子里，警告指出的是视觉顺序与原生文本顺序的分歧，而它引用的那几行还暴露出另一个问题——这份 PDF 的字体映射无法解码一张图的标签列：

```console
$ npx pdfvision tracemonkey.pdf -p 10
_chars: 6944 · images: 0 · coverage: 42% · vectors: 17 · warnings: 1 · size: 612×792pt_
… page body …
### Warnings
> **warning** (reading_order_divergence): layout line "?>9@AJ.0A:</C./8-2#3$4%56#" appears
> after "?>9@AJ.D<F@-<>2.@A:0>#3$4,56#" visually but earlier in the native text stream —
> native line order diverges from what a human reads; the body above is that reading order,
> rebuilt from the layout — render the page when exact sequence is critical
```

如果没有这条警告，智能体只会把 `?>9@AJ.0A:</C./8-2#3$4%56#` 当作一次成功的提取来读，并且永远不会发现问题。

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
- [布局与警告](./guide/layout-and-warnings) 深入讲解视觉结构信号。
- [渲染与 OCR](./guide/rendering-and-ocr) 覆盖图像输出、区域裁剪和扫描文档。
- [搜索与区域放大](./guide/search-and-region-zoom) 展示如何找到文本证据，并只渲染匹配区域。

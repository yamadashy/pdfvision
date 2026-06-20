---
title: 渲染与 OCR
description: 使用 pdfvision 渲染整页、渲染视觉区域，并对扫描 PDF 进行 OCR。
---

# 渲染与 OCR

对于扫描件、幻灯片、图表、示意图、截图和视觉表单，原生 PDF 文本通常不够。渲染和 OCR 可以让页面可检查。

pdfvision 把渲染当作证据，而不是最后手段。智能体可以先读取原生文本，发现页面视觉内容丰富或可疑后，再渲染整页或小裁剪。这让多模态调用更有针对性，也更容易审计。

## 何时渲染

当页面含义是视觉性的，或提取信号显示原生文本可能不代表人类看到的内容时，进行渲染。常见触发条件包括高 image/vector count、有可见内容但文本稀疏、图表密集页面、表单、截图、地图、幻灯片，以及关于 OCR 层或 glyph-corrupted text 的 warning。

不需要渲染所有页面。从 overview 开始，只渲染重要的页面或区域。

## 渲染整页

```bash
pdfvision document.pdf --render --render-output ./images --format json
```

每个选中页面都会得到一个图像路径。渲染图像使用与布局框一致的左上角坐标系，便于把 PDF 点映射到像素。

```bash
pdfvision document.pdf --render --render-scale 3
```

较小倍率减少图像大小，较大倍率更适合小标签和密集图表。

适合渲染整页的情况：

- PDF 是扫描件、幻灯片、图表密集报告、截图、地图或宣传册。
- warning 显示原生文本稀疏、字形损坏或与视觉不一致。
- 任务依赖精确视觉位置。
- 模型需要检查页面外观，而不只是文本。

图像路径会返回在 `pages[].image` 中，智能体可以直接传给支持视觉的模型。

## 渲染一个区域

```bash
pdfvision document.pdf --pages 2 --render --render-region 120,180,360,240 --render-output ./regions
```

`--render-region` 使用 PDF points 和左上角原点。它适合放大由布局块、图像框或视觉区域定位到的位置。

搜索结果的 bbox 也可以使用同一裁剪流程。参见 [搜索与区域放大](./search-and-region-zoom.md)。

区域渲染适用于：

- 验证一个合同条款或表格单元格。
- 读取图例或坐标轴标签。
- 检查 checkbox group 或表单值。
- 查看公式、图题或截图细节。
- 只把证据区域发送给视觉模型，减少图像 token。

## 渲染视觉区域

```bash
pdfvision document.pdf --render-visual-regions --render-output ./regions --format json
```

只裁剪并渲染图、图表、表单、表格和示意图等重要区域。

当智能体还不知道坐标时使用。pdfvision 会从 layout、image、vector、annotation 和 form evidence 推断 visual regions，并把这些区域分别渲染为 PNG。

## OCR

```bash
pdfvision scan.pdf --ocr --ocr-lang eng --format json
```

OCR 输出包含文本、置信度、语言和单词框。

多语言页面使用 `+` 连接语言：

```bash
pdfvision scan.pdf --ocr --ocr-lang eng+jpn --format json
```

当密度信号或 warning 表明原生文本缺失、稀疏、像扫描件或质量较低时，OCR 最有用。

OCR 不会覆盖原生文本，而是作为第二种信号附加。智能体可以比较：

- PDF text layer 的原生文本。
- 页面像素 OCR 出的文本。
- OCR confidence 和 word boxes。
- 页面 quality 和 warnings。

这种比较对带隐藏 OCR 层的扫描 PDF 很重要。有些 PDF 的不可见文本层看起来完整，但并不匹配人类看到的页面。pdfvision 会保留两种信号，并在不一致时给出 warning。

## 实用策略

按这个路径升级：

1. 运行 `pdfvision document.pdf --json`。
2. 如果页面视觉性强或可疑，运行 `--render`。
3. 如果可见文字缺失于原生提取，运行 `--ocr`。
4. 如果只有一个区域重要，用 `--search`、`--visual-regions` 或 layout boxes 裁剪。
5. 如果小字难读，提高 `--render-scale`。

当大多数页面已经可读时，不需要对每一页运行 OCR 或整页视觉模型。

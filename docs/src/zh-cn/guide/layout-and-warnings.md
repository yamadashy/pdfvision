---
title: 布局与警告
description: 理解 pdfvision 的布局重建、视觉区域、几何信息和页面警告。
---

# 布局与警告

PDF 的含义常常存在于位置关系中：分栏、标题、表单标签、表格、脚注、图、链接、注释、重复页眉或页脚都会影响阅读方式。`--layout` 保留这些信号，而不是把页面压平成一个文本流。

对于 AI 智能体，这一点很重要，因为看似合理的文本流仍然可能是错的。双栏论文可能被跨栏读取，财务表可能丢失行边界，表单值可能离开标签，页脚可能被误当正文。pdfvision 暴露布局和 warning 信号，让智能体能发现这些情况。

## 布局重建

```bash
pdfvision document.pdf --layout --format json
```

布局输出包括：

- `pages[].layout.lines`: 带几何信息的重建文本行。
- `pages[].layout.blocks`: 按阅读顺序排列的块、角色和 bbox。
- `pages[].layout.tables`: 原生文本可能压平行列关系时的数字表格提示。
- 竖排 CJK 文本恢复。

当原生文本流与视觉阅读顺序不同，Markdown 输出可以使用恢复后的 layout order。

需要 layout 的场景：

- 页面有分栏、侧栏、图题或脚注。
- 任务依赖标题或章节层级。
- 表单标签必须与值关联。
- 表格行列很重要。
- 重复的页面 chrome 不应被当作正文。
- 搜索结果或提取字段需要视觉坐标进行验证。

`layout.blocks` 不是为了隐藏原生文本。它给智能体提供带 geometry 和 role hints 的另一种 reading-order view，同时 `pages[].text` 仍可用于比较。

## 几何信息

```bash
pdfvision document.pdf --geometry --format json
```

`--geometry` 在 `pages[].spans` 中输出更底层的文本项、bbox 和字号。可用于搜索高亮、覆盖层和证据映射。

## 视觉框和区域

```bash
pdfvision document.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

重要字段：

- `pages[].imageBoxes`: 栅格图像。
- `pages[].vectorBoxes`: 图表路径、表格线、表单框、幻灯片形状等矢量绘制。
- `pages[].visualRegions`: 图、图表、表格、表单和示意图的可裁剪区域。

当智能体只需要检查这些区域时，使用 `--render-visual-regions`。

这是“把一切抽成文本”和“查看 PDF”之间的关键差异。幻灯片图表、签名框、标注图或表格网格可能没有多少有用原生文本，但其 image/vector geometry 会告诉智能体应该看哪里。

visual regions 可以作为到多模态模型的桥梁：

1. 用 `--visual-regions` 发现候选区域。
2. 选择 kind、page、bbox 和关联文本合适的区域。
3. 重新运行 `--render-region`，或使用 `--render-visual-regions`。
4. 让视觉模型只检查该证据区域。

## 页面警告

`pages[].warnings` 描述在信任原生文本前应该检查的异常。

常见警告包括：

- 文本重叠或文本框超出页面。
- 正文挤到重复页眉或页脚附近。
- 被压平的数字表格。
- 原生文本顺序与视觉阅读顺序不一致。
- 字形乱码、PUA 字符串或局部 mojibake。
- 全页扫描上的 OCR 文本层。
- 扫描页上的低置信度 OCR。
- 内部标签可能需要视觉模型读取的大型栅格区域。
- 表单、图表或示意图这样的密集矢量页面。

警告不是最终判断，而是告诉智能体下一步应检查哪里。

## 智能体应如何使用警告

把 warning 当作 routing signal：

- 如果原生文本字形损坏，在摘要前先与 render 或 OCR 比较。
- 如果阅读顺序分歧，叙事顺序优先使用 layout blocks，而不是 raw page text。
- 如果出现 table warning，保留行列证据；当数值重要时裁剪表格。
- 如果出现 large raster 或 dense vector warning，在验证前假设标签可能是 visual-only。
- 如果涉及 repeated chrome，避免混合页眉、页脚、页码和正文。

重要习惯不是让整个提取失败，而是让智能体选择下一步观察。pdfvision 会返回足够的证据来支持这个选择。

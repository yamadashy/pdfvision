---
title: 布局与警告
description: 理解 pdfvision 的布局重建、视觉区域、几何信息和页面警告。
---

# 布局与警告

PDF 的含义常常存在于位置关系中：分栏、标题、表单标签、表格、脚注、图、链接、注释、重复页眉或页脚都会影响阅读方式。`--layout` 保留这些信号，而不是把页面压平成一个文本流。

## 布局重建

```bash
pdfvision document.pdf --layout --format json
```

布局输出包括：

- `pages[].layout.lines`: 带几何信息的重建文本行。
- `pages[].layout.blocks`: 按阅读顺序排列的块、角色和 bbox。
- `pages[].layout.tables`: 原生文本可能压平行列关系时的数字表格提示。
- 竖排 CJK 文本恢复。

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

警告不是最终判断，而是告诉智能体下一步应检查哪里。

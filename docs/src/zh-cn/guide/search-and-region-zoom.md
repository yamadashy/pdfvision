---
title: 搜索与区域放大
description: 使用 pdfvision 搜索 PDF 文本、表单字段、注释和 OCR 输出，再把匹配区域渲染为 PNG 裁剪图供 AI 视觉模型检查。
---

# 搜索与区域放大

pdfvision 可以先找到文本证据，再只渲染匹配区域。这适合让智能体验证条款、表格单元格、图中标签、表单值或 OCR 结果，而不必把整页图像发送给视觉模型。

## 搜索 PDF

```bash
pdfvision report.pdf --search "revenue" --json
```

匹配结果会输出到 `pages[].matches[]`。每个 match 包含页码、query、source、文本片段，以及能够定位可见区域时的 bbox。

重复 `--search` 可以一次运行多个查询：

```bash
pdfvision paper.pdf --search "transformer" --search "attention" --json
```

默认搜索是字面量、大小写不敏感且感知 NFKC。只有任务需要时才启用正则或严格大小写：

```bash
pdfvision report.pdf --search "Q[1-4] revenue" --search-regex --json
pdfvision report.pdf --search "PDF" --search-case-sensitive --json
```

## 搜索覆盖范围

搜索可以匹配：

- PDF 原生文本。
- `--form-fields` 的文本值和 choice 值。
- `--annotations` 中可见的 FreeText 注释内容。
- `--ocr` 的 OCR 文本，可用时使用 OCR word boxes。

与原生文本、表单字段或注释重复的 OCR 匹配会被抑制，因此智能体不容易看到同一可见文本的重复结果。

## 渲染匹配区域

把 match 的 bbox 传给 `--render-region`：

```bash
pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --json
```

`--render-region` 要求选中的页恰好为一页。区域使用左上原点的 PDF points，并且必须在页面边界内。

如果裁剪图包含小标签、上标、密集表格单元格或图表图例，可以提高 `--render-scale`：

```bash
pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-scale 3 --render-output ./crops --json
```

## 智能体工作流

1. 运行 `--search` 找到候选证据。
2. 查看 `pages[].matches[]`，选择 page、source 和 bbox 合适的 match。
3. 用 `--pages`、`--render` 和 `--render-region` 重新运行，生成视觉裁剪图。
4. 让视觉模型把裁剪图与原生文本、OCR 文本或提取出的表格数据进行对照。

对于无法通过文本搜索定位的视觉区域，请结合 [渲染与 OCR](./rendering-and-ocr.md) 使用 `--visual-regions` 或 `--render-visual-regions`。

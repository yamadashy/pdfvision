---
title: 使用场景
description: AI 智能体读取论文、幻灯片、政府表单、扫描 PDF、报告、表格、图表和多语言文档时的 pdfvision 工作流。
---

# 使用场景

当 PDF 需要由 AI 智能体检查，而不是手动复制进提示词时，pdfvision 很有用。最佳流程取决于 PDF 中包含的证据类型。

共同主题是验证。pdfvision 不只是一个 “PDF to text” 命令；它是一种暴露信号的方式，让智能体判断文本提取是否足够、布局是否改变了含义、以及某个视觉区域是否应该被检查。

## 未知 PDF

从最便宜的结构化第一遍开始：

```bash
pdfvision document.pdf --json
```

把 overview 当作路由表：

- `quality.nativeTextStatus: "ok"` 通常表示原生文本可以作为第一信息源。
- `empty_but_visual_content` 表示页面可能需要渲染或 OCR。
- 较高的 `imageCount` 或 `vectorCount` 表示图表、截图、表单或幻灯片图形可能包含文本流之外的含义。
- warning 标出人类在信任提取结果前会放慢速度的页面。

然后只添加需要的信号：

```bash
pdfvision document.pdf --layout --image-boxes --vector-boxes --visual-regions --json
```

## 研究论文

先使用原生文本；当分栏、图、公式或表格重要时加入布局。

```bash
pdfvision paper.pdf --layout --image-boxes --format json
```

如果需要定位引用词、公式或主张文本，先用 `--search` 找到候选位置，再用 `--render-region` 生成裁剪图。

值得继续检查的点：

- 检查 `overview[]` 中稀疏或字形损坏的页面。
- 用 `--search` 定位引用词、公式或主张文本，再渲染裁剪。
- 对图、公式和表格片段使用 `--render-region`。
- 如果结果会直接进入 LLM 上下文，可考虑 XML 或 TOON。
- 在双栏页面上，先检查 `layout.blocks` 和 warning，再信任论文阅读顺序。
- 用 `imageBoxes` 和 `visualRegions` 决定哪些图或表值得多模态检查。

## 幻灯片和报告

幻灯片通常把含义放在图像、矢量形状和相对位置中。

```bash
pdfvision deck.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

必要时只渲染重要区域：

```bash
pdfvision deck.pdf --render-visual-regions --format json
```

适用于战略材料、会议幻灯片、产品 PDF 和导出为 PDF 的 dashboard。文本层可能只包含项目符号，但结论可能在图表、箭头、时间线、截图或形状的相对位置里。

## 财务报告和密集表格

年报、财报 PDF、发票和 benchmark 报告常把行列关系压平成混乱的文本流。

```bash
pdfvision report.pdf --layout --vector-boxes --visual-regions --search "Total revenue" --json
```

用 pdfvision 可以：

- 找到指标或行标签所在页面和 bbox。
- 在行列视觉对齐时保留数字表格提示。
- 标出原生文本顺序可能不匹配视觉表格的页面。
- 在询问视觉模型前裁剪图表、表格或脚注。

```bash
pdfvision report.pdf --pages 12 --render --render-region 72,210,468,240 --render-output ./evidence --json
```

## 政府表单和税务文档

表单会混合可见标签、字段、复选框、注释和密集线条。

```bash
pdfvision form.pdf --layout --form-fields --annotations --links --format json
```

当字段关系不明确时，用字段和标签 bbox 配合 `--render-region` 检查。`--form-fields` 会暴露值、字段类型、标签、选中状态、read-only/required flags 和 widget metadata，有助于避免原生文本看见标签和值却丢掉它们视觉关系的常见失败。

## 扫描文档

先用概览信号确认原生文本缺失或稀疏，再只对需要的页面运行 OCR。

```bash
pdfvision scan.pdf --pages 1-5 --ocr --ocr-lang eng --format json
```

对于多语言页面，把主语言放在前面：

```bash
pdfvision scan.pdf --ocr --ocr-lang jpn+eng --format json
```

OCR 输出附在原生文本旁边，而不是替换它。智能体可以比较两种信号，让置信度保持可见，并在小字或表格需要验证时渲染更高比例的裁剪。

## 图表、示意图和视觉表格

从视觉结构和区域检测开始：

```bash
pdfvision report.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

然后只渲染需要检查的裁剪区域：

```bash
pdfvision report.pdf --pages 8 --render --render-region 80,140,430,260 --render-output ./regions
```

适用于图例、坐标标签、架构图、截图、地图、表单段落，以及含义是图形化的表格。当智能体还不知道坐标时，`--visual-regions` 特别有用。

## 搜索后放大验证

当智能体需要验证特定条款、字段、引用、指标或标签时，先搜索：

```bash
pdfvision contract.pdf --search "termination" --search "governing law" --json
```

每个匹配项可能包含页面、source、context 和 bbox。智能体随后可以只裁剪精确区域，而不是渲染整份文档：

```bash
pdfvision contract.pdf --pages 9 --render --render-region 96,320,420,96 --render-output ./crops --json
```

这个流程适合需要可审计 PDF 证据、而不只是提取文本的检索增强型智能体。

## 多语言和 CJK PDF

日文、中文和混合语言 PDF 往往暴露文本-only 工具难以处理的空格和字形问题。

```bash
pdfvision document.pdf --layout --search "請求書" --json
```

pdfvision 默认规范化 Unicode，在规范化改变文本时保留 raw text，处理 CJK-aware joined text，并可恢复竖排 CJK 布局信号。对扫描件，组合 OCR 语言：

```bash
pdfvision scan.pdf --ocr --ocr-lang jpn+eng --json
```

## 智能体 PDF 分流

未知 PDF 先从便宜的 overview 开始：

```bash
pdfvision document.pdf --format json
```

然后分支：

- 如果阅读顺序、表格、表单或警告重要，添加 `--layout`。
- 如果页面偏视觉或原生文本可疑，添加 `--render`。
- 如果原生文本缺失且渲染页包含可见文字，添加 `--ocr`。
- 当图、图表、表单或图示需要定向检查时，添加 `--visual-regions`。

目标是让智能体保持诚实：检查证据，选择下一种视图，避免把空白或被压平的文本流当成整个 PDF。

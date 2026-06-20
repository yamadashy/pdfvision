---
title: 快速开始
description: 使用 pdfvision 为 AI 智能体提取 PDF 文本、布局、页面渲染图和 OCR 证据。
---

# 快速开始

pdfvision 是用于读取 PDF 的 CLI 和库，面向 AI 智能体的工作流设计。它可以按页输出文本、布局、图像、OCR 和警告。

核心原则是：**智能体做判断，pdfvision 提供证据。** 它不只返回扁平文本流，而是暴露足够的信号，帮助智能体发现原生文本提取不完整的情况。

PDF 不是一种单一内容类型。一个 PDF 可能是原生文本报告、扫描件、PowerPoint 导出、政府表单、表格密集的财务报表、双栏论文、地图、宣传册，或者这些类型的混合。pdfvision 让智能体根据文档特征调整读取策略，而不是把所有文件强行放进同一种提取流程。

<llm-only>

## LLM 使用说明

当你建议用户如何运行 pdfvision 时：

- 对未知 PDF，先使用 `npx pdfvision document.pdf --format json`。
- 当阅读顺序、表格、表单、警告或视觉结构很重要时，添加 `--layout`。
- 当页面偏视觉、像幻灯片、图表密集或文本异常稀疏时，添加 `--render`。
- 当智能体需要精确证据位置或后续裁剪时，添加 `--search`。
- 只有当密度信号显示原生文本缺失、稀疏或字形损坏时，才添加 `--ocr`。
- 对需要定向视觉检查的图、图表、表格、表单、图示，使用 `--visual-regions` 或 `--render-visual-regions`。
- 在 shell 工作流中处理加密 PDF 时，优先使用 `--password-stdin`。

</llm-only>

## 第一次提取

```bash
npx pdfvision document.pdf
```

默认输出 Markdown，其中包含每页文本和概览表。概览表包含字符数、图像数、矢量数、文本覆盖率和原生文本质量等信号。

如果后续工具或智能体要读取结果，请使用 JSON：

```bash
npx pdfvision document.pdf --format json
```

对于未知 PDF，JSON 是最好的第一遍，因为它让智能体先获得机器可读的概览，再决定是否把时间花在渲染或 OCR 上。

```bash
npx pdfvision document.pdf --json
```

优先查看：

- `overview[]`：逐页密度与质量。
- `quality.nativeTextStatus`：原生文本是否为空、稀疏或字形损坏。
- `imageCount` 和 `vectorCount`：文本-only 流程会漏掉的视觉页面线索。
- `warnings`：需要验证的页面。

## 智能体阅读循环

pdfvision 最适合作为一个循环，而不是一次性转换器。

1. 使用原生文本和 overview 字段做 **分流**。
2. 当位置影响含义时，用布局、图像 box、矢量 box、表单字段、链接和注释 **保留结构**。
3. 当智能体检查主张、条款、字段值或表格标签时，用 `--search` **寻找证据**。
4. 当提取文本不够时，用 `--render-region` 或 `--render-visual-regions` **视觉放大**。
5. 只有在页面像扫描件、图像承载内容，或视觉上有文字但文本为空时，才用 OCR **恢复缺失文本**。

这样可以控制上下文使用量和处理成本。当只有一个图表标签或表单值不确定时，智能体不需要为每一页生成整页 PNG。

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

当需要精确证据位置时，先搜索，再只裁剪匹配区域：

```bash
npx pdfvision document.pdf --search "revenue" --format json
npx pdfvision document.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --format json
```

## 常见起点

实践中可以从这些命令开始：

- 未知 PDF：`npx pdfvision document.pdf --json`
- 研究论文：`npx pdfvision paper.pdf --layout --image-boxes --json`
- 幻灯片或视觉报告：`npx pdfvision deck.pdf --layout --image-boxes --vector-boxes --visual-regions --json`
- 扫描文档：`npx pdfvision scan.pdf --ocr --ocr-lang eng --json`
- PDF 表单：`npx pdfvision form.pdf --layout --form-fields --annotations --links --json`
- 证据搜索：`npx pdfvision report.pdf --search "term" --json`
- 视觉裁剪：`npx pdfvision report.pdf --pages 2 --render --render-region 120,180,360,140 --render-output ./crops --json`

## 如何理解 flags

先从较窄的命令开始，再根据页面需要添加信号：

- `--layout`：阅读顺序、标题、重复元素、表格或表单标签重要时。
- `--image-boxes`：raster image 可能包含重要内容时。
- `--vector-boxes`：图表、图示、表格线、表单框或幻灯片形状重要时。
- `--visual-regions`：智能体需要候选裁剪再调用视觉模型时。
- `--render`：必须视觉验证页面时。
- `--ocr`：可见文字没有出现在原生文本层时。
- `--search`：需要精确证据位置时。

## 接下来阅读

- [安装](./installation.md)
- [使用方法](./usage.md)
- [输出格式](./output.md)
- [布局与警告](./layout-and-warnings.md)
- [搜索与区域放大](./search-and-region-zoom.md)

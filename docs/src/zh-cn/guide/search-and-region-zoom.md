---
title: 搜索与区域放大
description: 使用 pdfvision 搜索 PDF 文本、表单字段、注释和 OCR 输出，再把匹配区域渲染为 PNG 裁剪图供 AI 视觉模型检查。
---

# 搜索与区域放大

pdfvision 可以先找到文本证据，再只渲染匹配区域。这适合让智能体验证条款、表格单元格、图中标签、表单值或 OCR 结果，而不必把整页图像发送给视觉模型。

这是 pdfvision 中最适合智能体的工作流之一：用文本搜索作为低成本 locator，然后只在真正重要的位置切换到视觉证据。

## 搜索 PDF

```bash
pdfvision report.pdf --search "revenue" --matches-only --json
```

With `--matches-only`, JSON and TOON emit compact hits in the top-level `matches[]` array without page bodies. Each hit includes its page, `queryIndex` linked to the top-level `queries` array, source, text, optional context, tight `bbox`, and crop-ready `region`. Without `--matches-only`, full JSON and TOON keep hits in `pages[].matches[]` alongside the page payload; those full hits include `bbox`, but not `region`.

Full Markdown output still shows a per-page `Search matches` table when `--search` is used. With `--matches-only`, Markdown becomes a compact flat report, while JSON, XML, or TOON remain the better choice when another tool needs to consume coordinates directly.

If any selected page has a non-default PDF `/UserUnit`, the compact report preserves it as `pageUserUnits: [{ page, userUnit }]` in JSON/TOON, equivalent `<pageUserUnits>` entries in XML, and a `Page UserUnits` summary in Markdown. The metadata is omitted when every selected page uses UserUnit 1.

Compact output still retains optional diagnostics for every selected page with warnings or non-OK native or visual quality, including pages with no hits and searches with zero total results. JSON/TOON expose `pageDiagnostics` with raw quality and complete warnings; XML and Markdown present the same information in compact diagnostic sections. Inspect it before treating a hit or miss as visible evidence. Native quality describes native text only and does not rule out OCR or field hits. When applicable, `unreadableSource` keeps document-wide XFA placeholder scope and recovery guidance; rendering a confirmed XFA placeholder only renders the placeholder, so open it in Adobe Acrobat/Reader instead.

重复 `--search` 可以一次运行多个查询：

```bash
pdfvision paper.pdf --search "transformer" --search "attention" --json
```

默认搜索是字面量、大小写不敏感且感知 NFKC。只有任务需要时才启用正则或严格大小写：

```bash
pdfvision report.pdf --search "Q[1-4] revenue" --search-regex --json
pdfvision report.pdf --search "PDF" --search-case-sensitive --json
```

好的搜索目标包括：

- 合同条款和政策术语。
- 财务指标标签。
- 表格行名。
- 表单值。
- 图题和图表标签。
- 扫描页面上的 OCR 文本。
- Unicode 形式可能变化的多语言术语。

## 搜索覆盖范围

搜索可以匹配：

- PDF 原生文本。
- `--form-fields` 的文本值、choice 值，以及 checkbox / radio 的 export value。
- `--links` 的可点击 link target。
- `--annotations` 中可见的 FreeText 注释内容。
- `--ocr` 的 OCR 文本，可用时使用 OCR word boxes。

与原生文本、表单字段、链接或注释重复的 OCR 匹配会被抑制，因此智能体不容易看到同一可见文本的重复结果。链接命中只有在可见锚文本本身就是 target 的复述时（例如 URL 原样印在页面上）才会被同样抑制；如果锚文本只是与 target 共用一个词的正文，两个命中都会保留，因为句子和链接目标是不同的证据。

原生命中的 `context` 引用的是页面正文渲染出的同一行——这一点对从右向左的文字尤其重要，重建会补上原始 match 文本缺少的词间空格和括号方向。只有当该行明确属于这个 match（覆盖 match 框的大部分且包含匹配到的字符串）时才会引用；跨行拼接的命中，或被重建分配到别处的命中，会回退到一直以来的原始 span 拼接 context。

match 的 `source` 帮助智能体判断它应该被多大程度信任：

- `native`：来自 PDF text layer。
- `formField`：来自可见 widget value、display value 或 checkbox / radio 的 export value。
- `link`：来自可点击 link target。
- `annotation`：来自可见 FreeText annotation。
- `ocr`：来自页面像素，可能需要检查 confidence。

对于多 query 搜索，`queryIndex` 可让调用方把每个 hit 映射回产生它的重复 `--search` flag。

## 渲染匹配区域

`bbox` locates the matched text itself. The compact hit's `region` optionally expands that box to a detected containing table row or visual line, then adds padding and clamps the result within the page. Without a containing structure, it is the padded match geometry. The crop provides nearby visual evidence, but it does not guarantee that an entire table, all headers, or relevant footnotes are included. Compact search computes this region internally, so it does not need `--layout`.

Choose a compact hit by its `page`, `source`, and `context`, then pass its `region` unchanged. For example, if the chosen hit reports the illustrative values `page: 3` and `region: { x: 120, y: 180, width: 360, height: 140 }`, run:

```bash
pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --json
```

`--render-region` requires exactly one selected page. The region uses raw unrotated page-view units with a top-left origin; compact regions are already clamped, while a custom region must stay within the page bounds. Physical points = raw value × UserUnit; pixels = raw region × UserUnit × render scale. Read UserUnit from `pages[].userUnit` in the full report or the selected page's `pageUserUnits` entry in the compact report (1 when omitted).

Use `--render-scale` when the crop contains small labels, superscripts, dense table cells, or chart legends:

```bash
pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-scale 3 --render-output ./crops --json
```

Start with the emitted `region` unchanged. If the task needs different context, a custom narrower or wider crop remains available within the page bounds.

## 智能体工作流

1. Run `--search "…" --matches-only --json` to locate candidate evidence without page bodies.
2. Inspect top-level `matches[]` and choose the hit with the right page, source, and context.
3. Re-run with exactly that hit's `page` and unchanged `region` in `--pages`, `--render`, and `--render-region`.
4. Ask the vision model to compare the crop against the native text, OCR text, or extracted table data.

对于无法通过文本搜索定位的视觉区域，请结合 [渲染与 OCR](./rendering-and-ocr.md) 使用 `--visual-regions` 或 `--render-visual-regions`。

## 示例：可审计的 claim check

```bash
pdfvision annual-report.pdf --search "Net sales" --search "Operating income" --matches-only --json
```

An agent can inspect top-level `matches[]`, choose the hit with the right page, source, and context, then pass its `region` to the crop command. No `--layout` flag is needed because compact search computes the region internally. If that selected hit reports the following illustrative page and region, the follow-up is:

```bash
pdfvision annual-report.pdf --pages 42 --render --render-region 72,180,468,180 --render-output ./evidence --json
```

最终答案可以同时引用提取文本和渲染后的证据区域。

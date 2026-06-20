---
title: 结构化输出
description: 理解 pdfvision 的 DocumentResult、PageResult、overview、quality、layout、OCR、warnings、坐标和可选 PDF 功能字段。
---

# 结构化输出

`--format json`、`--format xml` 和 `--format toon` 暴露同一份 `DocumentResult` 数据。JSON 适合程序，XML 适合标签导向提示词，TOON 适合数组很多且需要节省 token 的输出。

该 schema 被设计成智能体的 evidence model。它不只说“这里是文本”，还会说明找到了多少文本、页面上有哪些视觉材料、原生文本是否可信、证据出现在页面的哪里，以及请求到的 PDF 功能字段是否存在。

## 顶层结构

```ts
interface DocumentResult {
  file: string;
  totalPages: number;
  metadata: DocumentMetadata;
  overview?: PageOverview[];
  pages: PageResult[];
}
```

按需出现的顶层字段包括：

- `pageLabels`：`--page-labels`。
- `attachments`：`--attachments`。
- `outline`：`--outline`。
- `viewer`：`--viewer`。
- `layers`：`--layers`。

## Page Overview

`overview[]` 是智能体首先应该检查的位置。

- `charCount`
- `imageCount`
- `vectorCount`
- `textCoverage`
- `nonPrintableRatio`
- `renderContentRatio`
- `quality`
- warning 和 match 计数

它用于发现原生文本为空、稀疏、与视觉矛盾或字形损坏的页面。

在长文档中，overview 尤其有用，因为它能让智能体只选择少量页面进行深入检查。

- 文本少而 image/vector 多的页面，可能是图表、幻灯片、扫描件或表单。
- 有 warning 的页面，在摘要前应该先验证。
- 有 search match 的页面可以直接裁剪为视觉证据。
- visual status 为空白或稀疏的页面，可能不值得升级到 OCR。

## Page Result

每个 `pages[]` 条目包含 `text`、`rawText`、页面尺寸、密度字段，以及按需出现的 `spans`、`layout`、`imageBoxes`、`vectorBoxes`、`visualRegions`、`formFields`、`links`、`annotations`、`structure`、`ocr`、`warnings` 和 `matches`。

OCR 不会覆盖原生文本。使用方应比较 `page.text` 与 `page.ocr?.text` 后再选择。

可选字段是有意 opt-in 的。`--layout --form-fields` 的 JSON 与没有请求这些 flags 的 JSON 不同。当请求了某个功能但没有找到元素时，pdfvision 会尽量使用空数组或 null-like 结构，帮助消费者区分“未请求”和“请求了但不存在”。

## Quality Fields

`quality.nativeTextStatus` 描述原生文本层：

- `ok`
- `mixed_glyph_indices`
- `unusable_glyph_indices`
- `sparse_text_on_blank_visual`
- `sparse_text_with_visual_content`
- `empty_but_visual_content`
- `empty`

`quality.visualStatus` 在渲染或 OCR 产生 raster 后出现：

- `ok`
- `sparse`
- `blank`

这些字段是观察值，不是命令。智能体决定是否渲染、OCR、裁剪或信任原生文本。

实用解释：

- `ok`：原生文本通常可以作为第一来源。
- `mixed_glyph_indices` 或 `unusable_glyph_indices`：信任文本前先用渲染或 OCR 验证。
- `sparse_text_with_visual_content`：页面可能有未进入文本层的视觉含义。
- `empty_but_visual_content`：通常需要渲染或 OCR。
- `sparse_text_on_blank_visual`：文本层可能包含不可见残留。
- `visualStatus: "blank"`：raster 没有显示可见内容。

## 坐标

所有 bbox 使用 PDF user-space points，左上角为原点。`x` 向右增加，`y` 向下增加，便于直接用于 `--render-region`。

带坐标的字段包括 spans、layout blocks/lines、image boxes、vector boxes、visual regions、form fields、links、annotations、structure references、OCR words 和 search matches。智能体可以从结构化提取直接跳到视觉裁剪，而不需要发明新的坐标系。

## 按任务理解证据字段

- 文本阅读：`pages[].text`、`rawText`、`quality`、`warnings`。
- 布局敏感阅读：`layout.lines`、`layout.blocks`、`layout.tables`、`spans`。
- 视觉检查：`image`、`renderContentRatio`、`imageBoxes`、`vectorBoxes`、`visualRegions`。
- 扫描恢复：`ocr.text`、`ocr.confidence`、`ocr.words`、`quality.visualStatus`。
- 证据搜索：`matches[].source`、`matches[].bbox`、`matches[].context`。
- 表单分析：`formFields`、labels、values、selected state、flags、actions。
- 导航和文档功能：`pageLabels`、`outline`、`links`、`viewer`、`layers`、`structure`。
- 文件清单：`attachments` metadata 和显式提取的 attachment paths。

对智能体工作流来说，关键是保留支持结论的字段。如果摘要依赖表格单元格，就保留页码和 bbox。如果使用了 OCR，就保留置信度和裁剪图。如果 warning 改变了提取策略，就保留 warning code。

## 可选 PDF 功能字段

许多 PDF 的意义位于纯文本流之外。pdfvision 让这些功能保持 opt-in，以便轻量提取仍然很小，但在 viewer 体验有意义的文档中它们非常重要。

使用 `--form-fields` 处理申请表、问卷和政府表单。它暴露 widget type、value、checked state、choices、flags、export values、actions、bbox 和附近标签，常用于区分空框、已选复选框和可见 choice field。

使用 `--links` 与 `--outline` 处理导航密集的文档。links 是带 bbox 与 target 的页面级 annotation，outline 是保留层级和 resolved destination 的文档级书签。它们适用于引用、目录、手册和“指向哪里”也是证据一部分的报告。

使用 `--annotations` 处理评论、高亮、stamp、ink、shape、file-attachment icons 或可见 FreeText notes 可能改变页面含义的情况。FreeText annotations 也会被 `--search` 搜索，因为它们可能对人类可见，却不在 `pages[].text` 中。

使用 `--viewer`、`--page-labels`、`--layers` 处理 PDF viewer state 有意义的情况。这些字段可以显示不同于物理页码的页码标签、open actions、viewer preferences、optional content groups、默认图层可见性和文档权限 flags。把它们视为关于 PDF 的观察值，而不是要执行的指令。

使用 `--structure` 处理 tagged PDF 可能包含 accessibility roles、figure alt text、language hints 或逻辑分组的情况。tagged structure 由 PDF 作者提供，准确性重要时应与可见页面证据比对。

使用 `--attachments` 处理带附件面板或补充文件的 PDF。结构化输出包含附件 metadata 与大小；只有显式提供 `--attachment-output` 时才写出 bytes。附件路径只是文件被提取的证据，不代表这些文件可以安全打开。

## 详细 schema

TypeScript 包导出完整 schema 类型，包括 `DocumentResult`、`PageResult`、`PageWarning`、`LayoutBlock`、`LayoutLine`、`TextSpan`、`ImageBox`、`VectorBox`、`VisualRegion`、`FormField`、`PageOcr` 和 `ProcessDocumentOptions`。

---
title: 提示词示例
description: 使用 pdfvision 输出让 AI 智能体检查 PDF、验证布局、提取表格、读取扫描件和分析表单的提示词模板。
---

# 提示词示例

在生成 pdfvision Markdown、XML、JSON 或 TOON 输出后，可以使用这些提示词。

这些提示词假设模型应把 pdfvision 输出当作证据，而不是最终答案。多数工作流中，模型应判断 PDF 是否需要下一轮 layout、rendering、OCR、search 或 region crops。

## PDF 初步检查

```text
请逐页审查这份 pdfvision 输出。

对每一页：
1. 总结可见内容。
2. 在信任原生文本之前检查 overview quality 字段和 warnings。
3. 找出需要 render、OCR 或区域级检查的页面。
4. 返回简洁的行动计划，并给出下一步要运行的 pdfvision 参数。
```

## 依赖布局的提取

```text
请使用 pdfvision layout blocks 和 warnings 重建人类阅读顺序。

重点关注：
1. 标题和章节层级。
2. 多栏阅读顺序。
3. 含义依赖位置关系的表格或表单标签。
4. 表示原生文本顺序与视觉顺序不一致的警告。

存在 layout warnings 时，不要只依赖 pages[].text。
```

## Evidence-First Summary

```text
请使用 pdfvision 输出作为证据总结这个 PDF。

规则：
1. 从 overview quality fields 和 page warnings 开始。
2. 对原生文本 empty、sparse 或 glyph-corrupted 的页面，不要在不说明缺失证据的情况下总结。
3. 当结论依赖表格、表单字段、图表或图片时，引用 page 和 bbox，或建议 crop command。
4. 区分可由文本确认的结论和需要视觉验证的结论。
```

## 表格审查

```text
请从这份 pdfvision JSON 中提取表格。

对每个表格：
1. 优先使用 pages[].layout.tables。
2. 保留行列关系。
3. 标出含义不明确或需要渲染裁剪图确认的单元格。
4. 包含页码和 bbox 证据。
```

## 财务指标验证

```text
请使用这份 pdfvision 输出验证财务指标。

对每个请求的指标：
1. 在 pages[].matches 或 layout table labels 中寻找候选。
2. 确定 page、row/column context 和 bbox evidence。
3. 检查 table flattening、reading-order divergence、dense vectors 或 raster-only content warnings。
4. 如果值是视觉编码的或不明确，返回用于生成最小可用裁剪的 pdfvision --render-region 命令。
5. 当 row 或 column alignment 不清楚时，不要从附近文本编造数值。
```

## 扫描文档 OCR

```text
请比较这份 pdfvision 输出中的 native text 和 OCR text。

对每一页：
1. 使用 quality.nativeTextStatus 和 quality.visualStatus 对页面分类。
2. 只有 native text 可用时才优先使用它。
3. 只有 native text empty、sparse 或 glyph-corrupted 时才优先使用 OCR。
4. 标出 low-confidence OCR 或需要更高分辨率 render 的页面。
```

## 表单分析

```text
请使用 pdfvision form fields 和 layout data 分析这个 PDF 表单。

返回：
1. 可见字段的标签、值和字段类型。
2. 复选框或单选按钮组及其选中状态。
3. hidden、read-only、required 或 no-view 字段。
4. 标签关系不明确、需要裁剪图确认的字段。
```

## 视觉报告审查

```text
请使用 pdfvision 输出审查这份视觉 PDF 报告。

重点关注：
1. imageCount 或 vectorCount 较高的页面。
2. pages[].visualRegions 及其 associated text。
3. 表示 visual-only labels、dense charts 或 sparse native text 的 warnings。
4. 验证重要 chart、diagram 或 screenshot 所需的最小 region crops。

在做视觉结论之前，先返回建议的 crop commands。
```

## 搜索后放大证据检查

```text
请使用这份 pdfvision JSON 中的 pages[].matches 选择最合适的证据位置。

对每个相关 match：
1. 报告 page、query、source、matched text 和 bbox。
2. 判断是否需要视觉验证。
3. 如果需要，返回包含 --pages、--render 和 --render-region 的精确 pdfvision 命令。
4. 裁剪图生成后，将其与原生文本、OCR 文本和附近 layout blocks 对照。
```

## 模型特定说明

- 需要精确字段的工具和智能体使用 JSON。
- 目标模型适合显式标签时使用 XML。
- structured arrays 很大且 token budget 重要时使用 TOON。
- 人类可读的第一遍使用 Markdown。
- 当结论依赖视觉页面而不只是 text layer 时，使用 rendered crops。

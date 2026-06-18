---
title: 提示词示例
description: 使用 pdfvision 输出让 AI 智能体检查 PDF、验证布局、提取表格、读取扫描件和分析表单的提示词模板。
---

# 提示词示例

在生成 pdfvision Markdown、XML、JSON 或 TOON 输出后，可以使用这些提示词。

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

## 表单分析

```text
请使用 pdfvision form fields 和 layout data 分析这个 PDF 表单。

返回：
1. 可见字段的标签、值和字段类型。
2. 复选框或单选按钮组及其选中状态。
3. hidden、read-only、required 或 no-view 字段。
4. 标签关系不明确、需要裁剪图确认的字段。
```

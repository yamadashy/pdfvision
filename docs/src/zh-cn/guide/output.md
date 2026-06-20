---
title: 输出格式
description: 选择 pdfvision 的 Markdown、JSON、XML 或 TOON 输出。
---

# 输出格式

pdfvision 可以用多种格式输出同一份提取结果。

## Markdown

```bash
pdfvision document.pdf
pdfvision document.pdf --format markdown
```

Markdown 是默认格式，适合直接交给聊天模型或人阅读。它包含概览表、每页文本、警告，以及启用渲染时的图像链接。

## JSON

```bash
pdfvision document.pdf --format json
```

JSON 暴露完整的 `DocumentResult` 架构，适合工具、智能体、测试和下游自动化。

常用字段包括：

- `pages[].layout`
- `pages[].warnings`
- `pages[].spans`
- `pages[].imageBoxes`
- `pages[].visualRegions`
- `pages[].ocr`
- `outline`, `attachments`, `layers`, `viewer`

## XML

```bash
pdfvision document.pdf --format xml
```

XML 将与 JSON 相同的数据表示为标签结构。某些 LLM 更容易定位 `<page>`、`<text>` 和 `<warning>` 这样的标签。

## TOON

```bash
pdfvision document.pdf --format toon
```

TOON 是同一结构化结果的 token 友好表示。对于 spans、image boxes、layout lines 等重复对象数组，通常比格式化 JSON 更紧凑。

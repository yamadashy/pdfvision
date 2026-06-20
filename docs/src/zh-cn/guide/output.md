---
title: 输出格式
description: 选择 pdfvision 的 Markdown、JSON、XML 或 TOON 输出。
---

# 输出格式

pdfvision 可以用多种格式输出同一份提取结果。

请根据输出的读者选择格式：人类、LLM prompt、工具，或 token 受限的 agent loop。底层 evidence 字段相同，格式只改变证据的呈现方式。

## Markdown

```bash
pdfvision document.pdf
pdfvision document.pdf --format markdown
```

Markdown 是默认格式，适合直接交给聊天模型或人阅读。它包含概览表、每页文本、警告，以及启用渲染时的图像链接。

当人类或 chat model 会直接读取输出时使用。它也适合作为第一遍，让模型在对话中理解文档并产生下一组 pdfvision 命令。

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

当需要程序化分支时使用 JSON：选择要 OCR 的页面、把 search matches 转成 render regions、把 warnings 与提取结果一起保存，或把图像路径传给另一个工具。

## XML

```bash
pdfvision document.pdf --format xml
```

XML 将与 JSON 相同的数据表示为标签结构。某些 LLM 更容易定位 `<page>`、`<text>` 和 `<warning>` 这样的标签。

当消费者是 LLM，且明确的 page、text、warning、matches、layout blocks 边界有帮助时使用 XML。

## TOON

```bash
pdfvision document.pdf --format toon
```

TOON 是同一结构化结果的 token 友好表示。对于 spans、image boxes、layout lines 等重复对象数组，通常比格式化 JSON 更紧凑。

TOON 适合 geometry-heavy 输出，其中 JSON key repetition 会占据大部分 prompt。智能体仍然收到同样的证据，但重复行更紧凑。

## 实用默认值

- 快速的人类可读提取使用 Markdown。
- 工具和 agent controllers 使用 JSON。
- 受益于显式标签的 prompt workflow 使用 XML。
- 紧张 context window 中的大型结构化输出使用 TOON。

为了 debugging 和可复现性，优先使用 JSON。直接给模型阅读时，选择目标模型最可靠遵循的表示。

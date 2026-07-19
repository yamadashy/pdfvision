---
title: 输出格式
description: 选择 pdfvision 的 Markdown、JSON、XML 或 TOON 输出。
---

# 输出格式

pdfvision 可以用多种格式呈现同一份提取证据，但各格式的序列化契约不同。

请根据输出的读者选择格式：人类、LLM prompt、工具，或 token 受限的智能体循环。底层 evidence 字段相同，格式只改变证据的呈现方式。

## Markdown

```bash
pdfvision document.pdf
pdfvision document.pdf --format markdown
```

Markdown 是默认格式，适合直接交给聊天模型或人阅读。它包含概览表、每页文本、警告，以及启用渲染时的图像链接。它会有意转换或省略结构化字段：不输出 `rawText`，而 `--strip-repeated` 会从正文移除重复布局块。

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

XML 是面向展示的标签形 near-parity projection，不是可逆的 `DocumentResult` 序列化。`page` 映射为 `no`，`pageLabel` 映射为 `label`，嵌套的 `quality` 会展平为页面属性。页面结果保留 rotation 属性，overview rotation 当前会省略，空字段的存在方式也可能不同。

`rawText` 变为同级 `<rawText>`，`repeated: true` 变为 `<block repeated="true">`，顶层 `xfa: true` 变为 `<document xfa="true">`。

XML 1.0 无法包含大多数 C0 控制字符、`U+FFFE` / `U+FFFF` 或未配对的 UTF-16 代理项。pdfvision 将每个禁止的代码单元表示为 `[[pdfvision:U+XXXX]]`，以保持 XML 格式正确。原文中的 `[[pdfvision:` 前缀会输出为 `[[pdfvision:literal:`，因此普通文本不会与生成的标记冲突。需要原始代码单元时，请在解析 XML 后从左到右扫描一次：还原 literal-prefix 转义且不要再次扫描已还原的前缀，并仅解码生成的代码单元标记。

当使用方或提示词按照明确的 `<page>`、`<text>`、`<warning>`、match 和 layout block 边界构建时使用 XML。

## TOON

```bash
pdfvision document.pdf --format toon
```

每个成功输出的 TOON 在解码后都与 JSON 数据模型完全一致，未设置的 `undefined` 字段保持不存在。TOON 的字符串语法无法让未配对的 UTF-16 代理项无损通过 UTF-8 边界，因此 pdfvision 会拒绝该边界情况并提示使用 JSON，而不是静默替换字符。有效的代理项对和字面量 `\uD800` 文本不受影响。具有相同标量字段的对象数组可以使用只声明一次字段名的表格形式。

包含嵌套值的数组，以及元素之间字段不同的数组，仍使用列表形式。

当符合条件的均一数组在结果中占多数时，可以考虑 TOON。在注重 token 的工作流中采用之前，请使用自己的文档和目标模型上下文比较各种格式。

## 实用默认值

- 快速的人类可读提取使用 Markdown。
- 工具和智能体控制器使用 JSON。
- 受益于显式标签的 prompt workflow 使用 XML。
- 当具有相同标量字段的对象数组占多数时考虑 TOON，并使用自己的文档与 JSON 比较。

为了 debugging 和可复现性，优先使用 JSON。直接给模型阅读时，请使用自己的文档和目标模型上下文比较各种格式。

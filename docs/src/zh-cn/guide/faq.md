---
title: FAQ
description: 关于空文本、扫描件、布局、OCR、渲染、缓存和密码的常见问题。
---

# FAQ

## pdfvision 是 PDF 转文本工具，还是视觉工具？

两者都是，但核心思想是证据。pdfvision 会在可用时提取原生文本，同时暴露布局、图像/矢量几何信息、警告、渲染图像、OCR、搜索匹配和 PDF 特性元数据，让 agent 判断仅靠文本是否足够。

## 为什么提取文本为空？

PDF 可能是扫描件、图像密集、加密，或使用了自定义字形编码。请检查概览字段和 `pages[].warnings`，然后尝试 `--render`、`--ocr` 或 `--layout`。

如果页面有 `empty_but_visual_content`，请渲染或 OCR。若存在字形相关警告，请在信任原生文本前与渲染页面或 OCR 结果比较。

## 什么时候使用 `--layout`？

当页面包含分栏、表格、表单、脚注、重复页眉或页脚、竖排 CJK，或任何位置会改变含义的内容时使用。

`--layout` 对论文、报告、财务报表、表单和幻灯片导出尤其有用，因为这些 PDF 的原始文本流可能与视觉阅读顺序不同。

## 什么时候使用 OCR？

当原生文本缺失、稀疏、像扫描页，或与渲染图像明显不一致时使用 `--ocr`。

OCR 会添加在原生文本旁边，而不是替换原生文本。Agent 应比较原生文本、OCR 文本、置信度和警告。

## 什么时候只渲染区域而不是整页？

在搜索、布局、图像 bbox、矢量 bbox 或 visual regions 找到关键区域后使用 `--render-region`。当模型只需要验证一个条款、表格单元格、图表标签、表单值或图形时，裁剪通常比整页渲染更合适。

## visual regions 是什么？

Visual regions 是可裁剪的页面区域，可能包含有意义的图形、图表、表格、表单区块、批注、示意图，或栅格/矢量聚集区域。它们帮助 agent 在把图像发送给 vision model 前先发现该看哪里。

## pdfvision 可以搜索 PDF 吗？

可以。`--search` 会输出 `pages[].matches[]`，包含页码、source、匹配文本、上下文，以及可用的 bbox。搜索可以覆盖原生文本、可见表单字段值、FreeText 批注，以及启用 OCR 后的 OCR 输出。

## pdfvision 使用什么坐标系？

bbox 使用 PDF user-space points，左上角为原点。`x` 向右增加，`y` 向下增加。

## 缓存在哪里？

结果缓存在操作系统临时目录中。设置 `PDFVISION_CACHE_DIR=/path` 可以覆盖位置，使用 `--no-cache` 可以跳过缓存，运行 `pdfvision --clear-cache` 可以清除缓存。

## PDF 密码应该如何传递？

优先使用 `--password-stdin`，避免密码出现在进程参数中：

```bash
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```

## 应该使用哪种输出格式？

快速人工阅读使用 Markdown，工具和 agent 控制使用 JSON，面向标签的提示词使用 XML，结构化输出很大且 token 预算紧张时使用 TOON。

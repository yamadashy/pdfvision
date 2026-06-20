---
title: Agent Skill
description: 为 Claude Code、Codex、Cursor 和其他支持 skill 的智能体安装并使用 pdfvision agent skill。
---

# Agent Skill

pdfvision 在 `skills/pdfvision/` 中包含一个 agent skill。它告诉智能体何时调用 CLI、先尝试哪些参数，以及何时升级到布局、渲染、OCR 或视觉区域裁剪。

## 安装

```bash
npx skills add yamadashy/pdfvision
```

全局安装：

```bash
npx skills add yamadashy/pdfvision -g
```

## Skill 覆盖的内容

- 可读 PDF 的默认提取流程。
- 使用密度信号发现静默失败。
- 何时添加 `--layout`、`--render`、`--ocr`、`--image-boxes` 或 `--visual-regions`。
- 结构化输出参考文档的路由。
- OCR 语言和 traineddata 故障排查。

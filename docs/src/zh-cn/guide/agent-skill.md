---
title: 智能体技能
description: 为 Claude Code、Codex、Cursor 和其他支持技能的智能体安装并使用 pdfvision 智能体技能。
---

# 智能体技能

pdfvision 在 `skills/pdfvision/` 中包含一个智能体技能。它告诉智能体何时调用 CLI、先尝试哪些参数，以及何时升级到布局、渲染、OCR 或视觉区域裁剪。

PDF 工作很少能用一个固定命令解决。一个有用的智能体应检查第一轮结果，发现缺失或可疑证据，并选择下一次 pdfvision pass。内置技能编码了这个 workflow，使每个智能体会话不必重新发现它。

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
- 何时用 `--search` 和 `--render-region` 做 evidence-focused crops。
- 结构化输出参考文档的路由。
- OCR 语言和 traineddata 故障排查。

skill 的主指令刻意保持简短，只在任务需要时指向 references。

## 智能体工作流

支持技能的智能体通常应该：

1. 从结构化提取开始。
2. 检查 overview fields、page quality 和 warnings。
3. 当位置重要时添加 layout 或 visual boxes。
4. 当用户询问特定条款、指标、标签或字段值时，搜索 exact evidence。
5. 只有需要视觉验证时才渲染页面或区域。
6. 当原生文本缺失、稀疏或与视觉矛盾时使用 OCR。

这能保持交互高效，同时仍让智能体有机会像人类读者一样查看 PDF。

## 何时安装

在智能体经常读取 PDF、报告、幻灯片、表单或扫描文档的项目中安装该技能。已经使用 Claude Code、Codex、Cursor 或其他支持技能的智能体环境的 repository 尤其适合。

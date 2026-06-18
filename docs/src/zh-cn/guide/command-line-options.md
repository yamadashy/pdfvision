---
title: CLI 选项
description: 按输入、输出、布局、渲染、OCR、PDF 功能和缓存整理 pdfvision CLI 选项。
---

# CLI 选项

本页按任务整理主要参数。请运行 `pdfvision --help` 查看精确的当前帮助文本。

## 输入

| 选项 | 用途 |
| --- | --- |
| `<file.pdf>` | 读取本地 PDF 文件。 |
| `--remote <url>` | 下载 HTTP(S) PDF，缓存并验证后再提取。 |
| `--pages <range>` | 指定页码范围，例如 `1-5`、`3` 或 `1,3,5`。 |
| `--password <value>` | 打开加密 PDF。 |
| `--password-stdin` | 从标准输入读取密码，标准输入为空时回退到 `--password`。 |

## 输出

| 选项 | 用途 |
| --- | --- |
| `--format <type>` | 输出 `markdown`、`json`、`xml` 或 `toon`。 |
| `--no-normalize` | 禁用 Unicode NFKC 规范化。 |

## 渲染

| 选项 | 用途 |
| --- | --- |
| `--render` | 将选定页面渲染为 PNG。 |
| `--render-output <dir>` | 指定渲染图像输出目录。 |
| `--render-scale <n>` | 设置栅格化倍率。 |
| `--render-region <x,y,width,height>` | 只渲染一页中的指定矩形。 |

## 布局与视觉结构

| 选项 | 用途 |
| --- | --- |
| `--geometry` | 在 `pages[].spans` 中输出文本项 bbox 和字号。 |
| `--layout` | 重建行、块、竖排 CJK、数字表格提示和布局警告。 |
| `--image-boxes` | 在 `pages[].imageBoxes` 中输出栅格图像 bbox。 |
| `--vector-boxes` | 在 `pages[].vectorBoxes` 中输出矢量绘制 bbox。 |
| `--visual-regions` | 输出图、表、表单、图表等可裁剪区域。 |
| `--render-visual-regions` | 渲染视觉区域裁剪图。 |

## PDF 功能

| 选项 | 用途 |
| --- | --- |
| `--form-fields` | 输出表单字段、标签、选项和动作。 |
| `--links` | 输出链接注释和解析后的目标。 |
| `--annotations` | 输出非链接注释、附件和形状几何。 |
| `--structure` | 输出 Tagged PDF 结构树。 |
| `--page-labels` | 输出查看器页码标签。 |
| `--attachments` | 输出嵌入附件元数据。 |
| `--outline` | 输出书签、URL 和动作。 |
| `--viewer` | 输出查看器设置和 JavaScript 动作。 |
| `--layers` | 输出 Optional Content Group 和图层顺序。 |

## OCR 与缓存

| 选项 | 用途 |
| --- | --- |
| `--ocr` | 运行 Tesseract OCR 并添加 `pages[].ocr`。 |
| `--ocr-lang <lang>` | 指定 OCR 语言，例如 `eng`、`jpn` 或 `eng+jpn`。 |
| `--no-cache` | 跳过磁盘缓存。 |
| `--clear-cache` | 清除缓存后退出。 |

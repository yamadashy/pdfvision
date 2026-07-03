---
title: CLI 选项
description: pdfvision CLI 选项参考，涵盖 PDF 输入、输出格式、渲染、OCR、搜索、布局、元数据和缓存行为。
---

# CLI 选项

本页按任务整理 CLI 参数。请运行 `pdfvision --help` 查看当前安装版本的精确帮助文本。

## 输入

| 选项 | 用途 |
| --- | --- |
| `<file.pdf>` | 读取本地 PDF 文件。 |
| `--remote <url>` | 下载 HTTP(S) PDF，验证 PDF header 后再提取。除非同时传入 `--no-cache`，否则会缓存。 |
| `-p, --pages <range>` | 提取 `1`、`1-5`、`1,3,5`、`2-4,7` 等页码范围。默认提取全部页面。 |
| `--password <value>` | 使用密码打开加密 PDF。密码不会写入输出。 |
| `--password-stdin` | 从管道 stdin 读取密码。stdin 为空时回退到 `--password`。 |

## 输出格式

| 选项 | 用途 |
| --- | --- |
| `-f, --format <type>` | 输出 `markdown`、`json`、`xml` 或 `toon`。默认是 `markdown`。 |
| `--markdown` | `--format markdown` 的快捷方式。 |
| `--json` | `--format json` 的快捷方式。 |
| `--xml` | `--format xml` 的快捷方式。 |
| `--toon` | `--format toon` 的快捷方式。 |
| `--no-normalize` | 禁用 Unicode NFKC 规范化。启用规范化时，JSON/XML 会在 `rawText` 保留发生变化前的文本。 |

格式快捷方式是严格的：传入两个不同快捷方式，或快捷方式与 `--format` 冲突，都会报错。

## 渲染

| 选项 | 用途 |
| --- | --- |
| `-r, --render` | 将每个选中页面渲染为 PNG，并在页面结果中附加图像路径。 |
| `--render-output <dir>` | 指定页面 PNG 或视觉区域 PNG 的输出目录。需要 `--render` 或 `--render-visual-regions`。 |
| `--render-scale <n>` | 设置 `--render`、`--render-visual-regions` 或 `--ocr` 的栅格化倍率。默认 `2`，范围 `(0, 4]`。 |
| `--render-region <x,y,width,height>` | 只渲染一页中的 PDF 点坐标矩形。需要 `--render` 或 `--ocr`，且 `--pages` 必须解析为恰好一页。 |

坐标使用左上原点：`x` 向右增加，`y` 向下增加。layout block、image box、vector box、search match 和 visual region 使用同一坐标系。

## 布局与视觉结构

| 选项 | 用途 |
| --- | --- |
| `--geometry` | 在 `pages[].spans` 中输出每个文本项的 bbox 和字号。面向结构化格式。 |
| `--layout` | 重建行、块、竖排 CJK、数字表格提示、Markdown 布局顺序和布局警告。 |
| `--image-boxes` | 在 `pages[].imageBoxes` 中输出栅格图像 bbox。 |
| `--vector-boxes` | 在 `pages[].vectorBoxes` 中输出矢量绘制 bbox。 |
| `--visual-regions` | 输出图、图表、表格、表单、注释以及栅格/矢量集群的可裁剪区域。 |
| `--render-visual-regions` | 渲染视觉区域裁剪图，并附加路径、content ratio 和更紧的 rendered content box。隐含 `--visual-regions`。 |
| `--strip-repeated` | 从 Markdown 输出中移除重复页眉、页脚和页码块。需要 `--layout`，仅适用于 Markdown。 |

## 搜索

| 选项 | 用途 |
| --- | --- |
| `--search <query>` | 查找出现位置，并输出带 page、source、text、query 和 bbox 的 `pages[].matches[]`。可重复传入。 |
| `--search-regex` | 将每个 `--search` 值当作 JavaScript 正则表达式。 |
| `--search-case-sensitive` | 精确区分大小写。默认不区分大小写。 |

搜索默认感知 NFKC，可匹配原生文本、表单字段、link targets、可见 FreeText 注释，以及启用 `--ocr` 时的 OCR 文本。

## PDF 功能

| 选项 | 用途 |
| --- | --- |
| `--form-fields` | 输出 widget 字段、flags、actions、export values、选项、值、bbox 和附近可见标签。Markdown 也会渲染表单字段表。 |
| `--links` | 输出链接注释、bbox、URL、命名目标，以及可解析的目标页。 |
| `--annotations` | 输出评论、高亮、图章、文件附件、形状和 ink 等非链接注释。 |
| `--structure` | 当 PDF 提供 tagged-PDF 结构树时输出它。 |
| `--page-labels` | 在 `pageLabels` 和 `pages[].pageLabel` 中输出查看器页码标签。 |
| `--attachments` | 输出嵌入附件元数据，不把文件字节嵌入结构化输出。 |
| `--attachment-output <dir>` | 将嵌入附件写入磁盘。需要 `--attachments`。 |
| `--outline` | 输出文档大纲/书签、层级、URL、动作和可解析的目标。 |
| `--viewer` | 输出查看器设置、open action、JavaScript action、权限和 MarkInfo。 |
| `--layers` | 输出 optional content groups、可见状态、radio groups 和查看器面板顺序。 |

## OCR

| 选项 | 用途 |
| --- | --- |
| `--ocr` | 运行 Tesseract OCR，并附加包含 text、confidence、language 和 word boxes 的 `pages[].ocr`。 |
| `--ocr-lang <lang>` | 指定 OCR 语言，例如 `eng`、`jpn` 或 `eng+jpn`。默认 `eng`。 |

OCR 不会替换 `pages[].text`；它会作为额外信号并列输出，便于智能体比较原生文本和 OCR。

## 缓存与帮助

| 选项 | 用途 |
| --- | --- |
| `--no-cache` | 跳过磁盘提取缓存。与 `--remote` 一起使用时，下载的 PDF 会直接处理，不写入 remote-PDF 缓存。 |
| `--clear-cache` | 清除提取、渲染 PNG 和远程下载缓存后退出。 |
| `-v, --version` | 打印 pdfvision 版本。 |
| `-h, --help` | 打印 CLI 帮助。 |

## 退出码

| 代码 | 含义 |
| --- | --- |
| `0` | 成功。 |
| `1` | 参数错误、文件不存在、网络错误或提取失败。错误信息会输出到 stderr。 |

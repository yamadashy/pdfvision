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

子命令会在解析任何选项之前被识别，且只在第一个参数位置被识别；传给子命令的参数会以退出码 `1` 结束。接下来 CLI 解析选项语法：未知选项或缺少选项值时，即使同时提供 `--help` 也会以退出码 `1` 结束。解析成功后，terminal action 的优先级依次为 `--version`、`--help`、`--clear-cache`；这些操作会跳过输入检查和提取选项的语义验证。其他情况下，pdfvision 会先 trim `--remote`。如果有多个位置参数，则会在检查输入源是否存在之前以退出码 `1` 结束。位置参数最多一个时，pdfvision 会检查是否存在非空位置参数或非空白的 `--remote` URL；两者都没有时，会在提取、缓存设置或提取选项语义验证前将完整 usage 输出到 stderr，并以退出码 `2` 结束。有可用输入时的参数语义错误，以及缓存清理失败，均以退出码 `1` 结束。

## 输出格式

| 选项 | 用途 |
| --- | --- |
| `-f, --format <type>` | 输出 `markdown`、`json`、`xml` 或 `toon`。默认是 `markdown`。 |
| `--markdown` | `--format markdown` 的快捷方式。 |
| `--json` | `--format json` 的快捷方式。 |
| `--xml` | `--format xml` 的快捷方式。 |
| `--toon` | `--format toon` 的快捷方式。 |
| `--no-normalize` | 禁用 Unicode NFKC 规范化。启用时，JSON/TOON 在 `pages[].rawText` 保留变更前文本，XML 使用同级 `<rawText>`，Markdown 省略它。 |

格式快捷方式是严格的：传入两个不同快捷方式，或快捷方式与 `--format` 冲突，都会报错。

以下 JSON 风格路径仅对 JSON、解码后的 TOON 和 `processDocument()` 精确有效。XML 映射 `page` → `no`、`pageLabel` → `label`、嵌套 `quality` → 展平属性。页面结果保留 rotation 属性，overview rotation 当前省略，空字段的存在方式也可能不同。

## 渲染

| 选项 | 用途 |
| --- | --- |
| `-r, --render` | 将每个选中页面渲染为 PNG，并在页面结果中附加图像路径。 |
| `--render-output <dir>` | 指定页面 PNG 或视觉区域 PNG 的输出目录。需要 `--render` 或 `--render-visual-regions`。 |
| `--render-scale <n>` | 设置 `--render`、`--render-visual-regions` 或 `--ocr` 的栅格化倍率。默认 `2`，范围 `(0, 4]`。 |
| `--render-region <x,y,width,height>` | 以未旋转的原始 page-view units 渲染一页中的矩形。需要 `--render` 或 `--ocr`，且 `--pages` 必须恰好解析为一个页面。 |

坐标使用左上原点：`x` 向右增加，`y` 向下增加。layout block、image box、vector box、search match 和 visual region 使用相同的原始 page-view units。物理点数 = 原始值 × `pages[].userUnit`（省略时按 1）；像素数 = 原始区域 × UserUnit × render scale。

## 布局与视觉结构

| 选项 | 用途 |
| --- | --- |
| `--geometry` | 在 `pages[].spans` 中输出每个文本项的 bbox 和字号。面向结构化格式。 |
| `--layout` | 重建行、块、竖排 CJK、数字表格提示、Markdown 布局顺序和布局警告。 |
| `--image-boxes` | 在 `pages[].imageBoxes` 中输出栅格图像 bbox。 |
| `--vector-boxes` | 在 `pages[].vectorBoxes` 中输出矢量绘制 bbox。 |
| `--visual-regions` | 输出图、图表、表格、表单、注释以及栅格/矢量集群的可裁剪区域。 |
| `--render-visual-regions` | 渲染视觉区域裁剪图，并附加路径、content ratio 和更紧的 rendered content box。隐含 `--visual-regions`。 |
| `--strip-repeated` | 从 Markdown 移除重复块。需要 `--layout`；JSON/TOON 保留 `repeated: true`，XML 保留 `repeated="true"` 块属性。 |

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
| `--page-labels` | JSON/TOON 使用 `pageLabels` / `pages[].pageLabel`；XML 使用 `page` / `label` 属性输出查看器页码标签。 |
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
| `--no-cache` | 跳过提取缓存和远程 PDF 缓存。OCR support files 仍使用经过验证的缓存根目录；未指定 `--render-output` 的渲染使用单独的操作系统临时路径。 |
| `--clear-cache` | `clear-cache` 子命令的已弃用别名。它仍会清除缓存并打印警告；将在 v1.0 中移除。 |
| `-v, --version` | 打印 pdfvision 版本。 |
| `-h, --help` | 打印 CLI 帮助。 |

## 子命令

选项描述如何读取 PDF。任何不读取 PDF 的操作都是子命令，只在第一个参数位置被识别，不接受任何属于自己的选项。`--help` 和 `--version` 是常见例外，包括子命令之后在内的任何位置都有效。

| 子命令 | 用途 |
| --- | --- |
| `clear-cache` | 仅在验证 pdfvision 所有权标记后清除配置的缓存根目录，然后退出。危险的宽泛根目录、没有标记的自定义根目录及其他无法验证的根目录都会被拒绝。 |
| `mcp` | 通过 stdio 以 Model Context Protocol 提供 pdfvision 服务。参见 [MCP 服务器](./mcp-server.md)。 |

如果文件恰好命名为 `mcp` 或 `clear-cache`，必须以 `./mcp` 或 `./clear-cache` 的形式传入。由于清理是破坏性操作，当工作目录中存在该名称的条目（包括链接目标缺失的 symlink）时，`clear-cache` 会以退出码 `1` 拒绝执行，而不是猜测。

## 退出码

| 代码 | 含义 |
| --- | --- |
| `0` | 成功，包括 `--help`、`--version` 和成功的 `clear-cache`。 |
| `1` | 选项语法错误；提供多个位置参数；有可用输入时的参数语义错误；文件不存在、网络/缓存/clear-cache错误或提取失败。错误信息会输出到 stderr。 |
| `2` | 位置参数最多一个，且未提供非空位置参数或非空白的 `--remote` URL。完整 usage 会输出到 stderr。 |

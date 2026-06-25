---
title: 安全与隐私
description: 了解 pdfvision 如何处理本地文件、远程 PDF、密码、缓存目录、OCR traineddata、附件、JavaScript 动作和敏感输出审查。
---

# 安全与隐私

pdfvision 在本地运行。它不收集遥测数据，也不会把 PDF 内容上传到服务端。

## 本地处理

本地文件会在你的机器上处理。渲染图像、OCR traineddata、远程下载和提取缓存会写入 pdfvision 缓存目录，除非你显式指定输出路径。

```bash
pdfvision --clear-cache
```

该命令会删除 pdfvision 管理的提取、渲染、远程下载和 OCR traineddata 缓存。

## 远程 PDF

`--remote` 会下载 HTTP(S) URL，并在提取前验证内容是否为 PDF。

```bash
pdfvision --remote https://example.com/document.pdf --format json
```

远程服务器仍然会看到这次请求。除非可以接受该网络访问，否则不要对私有 URL 使用 `--remote`。

只接受 `http:` 和 `https:` URL。会跟随重定向，但非 PDF response 会在进入 remote cache 前被拒绝。pdfvision 会检查正文开头附近的 PDF header，拒绝超过下载限制的响应，并使用 network timeout 防止 stalled server 无限占用 CLI。

对于一次性的私有或过期 URL，使用 `--remote --no-cache`，这样下载的 PDF bytes 不会写入 remote-PDF cache。

## 密码

PDF 密码只用于 pdf.js 解密，不会出现在输出中。

```bash
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```

CLI 工作流中优先使用 `--password-stdin`。

`--password <value>` 仍可作为显式 fallback，但它可能出现在 shell 历史和进程列表中。

## 缓存位置与权限

默认情况下，结果缓存在操作系统临时目录下。用 `PDFVISION_CACHE_DIR` 控制位置：

```bash
PDFVISION_CACHE_DIR=/secure/cache pdfvision document.pdf --format json
```

缓存可能包含提取文本、渲染 PNG、远程 PDF、OCR traineddata 和 OCR output。请选择与所处理 PDF 相同敏感级别的缓存目录。

pdfvision 在 POSIX 系统上使用较严格的文件权限，并防御常见 symlink 与 time-of-check/time-of-use 缓存问题。`--clear-cache` 会删除配置 cache root 下由 pdfvision 管理的缓存数据。

## 附件与 JavaScript actions

`--attachments` 可以暴露嵌入文件 metadata；使用 `--attachment-output` 时会把嵌入文件写入磁盘。请把提取出的附件视为 untrusted files。

附件文件名在写入前会被 sanitize：路径分隔符和控制字符会被替换，空名称会获得 fallback，重复名称会 disambiguate。pdfvision 也拒绝把附件输出写入 symlinked output directory。这些检查能降低 filesystem 风险，但不能让嵌入文件变得安全。

`--viewer` 和 form-field actions 可能把 PDF JavaScript source 作为数据暴露。pdfvision 不会执行 PDF JavaScript。

Viewer permissions 会作为 document metadata 报告。它们描述 PDF 希望 reader 允许或禁止什么，不是安全边界，也不应被当作 DRM enforcement。

## Search Regex 安全

默认搜索把 query 当作 literal text。`--search-regex` 会把每个 query 编译为 JavaScript regular expression，并在 native text、form-field text、clickable link targets、visible FreeText annotations，以及启用 OCR 时的 OCR text 上运行。

只对可信 pattern 启用 regex mode。pdfvision 会限制每个 query、page、source 输出的 match 数，但 JavaScript regular expressions 仍可能在单次 catastrophic-backtracking match 中消耗过多时间。向 untrusted users 暴露 regex search 的应用应自行使用 timeout 或 worker isolation。

## 分享前检查

结构化输出可能包含文档文本、元数据、注释、表单值、链接、JavaScript 动作、附件名称和渲染图像路径。发送给第三方 AI 服务前请先审查。

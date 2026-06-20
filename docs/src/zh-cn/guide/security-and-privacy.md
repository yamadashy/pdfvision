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

## 密码

PDF 密码只用于 pdf.js 解密，不会出现在输出中。

```bash
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```

CLI 工作流中优先使用 `--password-stdin`。

## 分享前检查

结构化输出可能包含文档文本、元数据、注释、表单值、链接、JavaScript 动作、附件名称和渲染图像路径。发送给第三方 AI 服务前请先审查。

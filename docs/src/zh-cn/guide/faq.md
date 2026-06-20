---
title: FAQ
description: 关于空文本、扫描件、布局、OCR、渲染、缓存和密码的常见问题。
---

# FAQ

## 为什么提取文本为空？

PDF 可能是扫描件、图像密集、加密，或使用了自定义字形编码。请检查概览字段和 `pages[].warnings`，然后尝试 `--render`、`--ocr` 或 `--layout`。

## 什么时候使用 `--layout`？

当页面包含分栏、表格、表单、脚注、重复页眉或页脚、竖排 CJK，或任何位置会改变含义的内容时使用。

## 什么时候使用 OCR？

当原生文本缺失、稀疏、像扫描页，或与渲染图像明显不一致时使用 `--ocr`。

## pdfvision 使用什么坐标系？

bbox 使用 PDF user-space points，左上角为原点。`x` 向右增加，`y` 向下增加。

## 缓存在哪里？

结果缓存在操作系统临时目录中。设置 `PDFVISION_CACHE_DIR=/path` 可以覆盖位置，使用 `--no-cache` 可以跳过缓存，运行 `pdfvision --clear-cache` 可以清除缓存。

## PDF 密码应该如何传递？

优先使用 `--password-stdin`，避免密码出现在进程参数中：

```bash
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```

---
title: 使用方法
description: 本地 PDF、远程 PDF、页码范围、渲染、布局、OCR 和加密 PDF 的常见用法。
---

# 使用方法

本页展示常见命令模式。对于未知 PDF，先做结构化第一遍，检查页面 overview，再只在证据需要的地方添加布局、渲染、OCR、搜索或视觉区域。

## 推荐第一遍

```bash
pdfvision document.pdf --json
```

用它回答：

- 哪些页面有可用的原生文本？
- 哪些页面偏视觉、像扫描件或字形损坏？
- 哪些页面有警告？
- 哪些页面需要布局重建、OCR 或渲染裁剪？

## 本地 PDF

```bash
pdfvision document.pdf
```

## 远程 PDF

```bash
pdfvision --remote https://example.com/document.pdf --format json
```

远程下载会被缓存，并在提取前验证是否为 PDF。如果 `.pdf` URL 返回 HTML、登录页或挑战页，pdfvision 会在缓存前失败。

`--remote` 只接受 HTTP(S) URL，跟随重定向，并拒绝正文开头附近没有 PDF header 的响应。默认下载保护比较保守：最大 100 MB，网络超时 60 秒。

远程缓存按 URL 建立。如果一个稳定 URL 的内容会被原地更新，可用 `--no-cache` 做一次新鲜获取，或用 `--clear-cache` 删除缓存副本：

```bash
pdfvision --remote https://example.com/document.pdf --no-cache --format json
```

## 页码范围

```bash
pdfvision document.pdf --pages 1-3
pdfvision document.pdf --pages 1,3,5 --format json
```

页码范围使用从 1 开始的物理页码。逗号组合多个选择器，范围包含两端，重复页会合并到排序后的输出中。

有效示例：

- `1`
- `1-5`
- `1,3,5`
- `2-4,7`

空片段、0、负数、`5-3` 这样的降序范围和格式错误的范围都会直接报错，而不是猜测用户意图。如果选择器包含超出文档末尾的页，但至少选中了一个真实页，pdfvision 会提取真实页，并为被跳过的页发出警告。

## 渲染页面

```bash
pdfvision document.pdf --render --render-output ./images --format json
```

使用 `--render-scale` 控制图像细节：

```bash
pdfvision document.pdf --render --render-scale 3
```

## 提取布局和视觉结构

```bash
pdfvision document.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

这会添加布局块、图像框、矢量框、视觉区域和布局警告。

适用于双栏论文、幻灯片、财务报告、表格、表单、图表、图示，以及任何视觉位置会改变含义的页面。

## 只渲染重要区域

```bash
pdfvision document.pdf --render-visual-regions --render-output ./regions --format json
```

当不想渲染整页，但需要查看图、表、表单或图表区域时使用。

## 搜索并放大

```bash
pdfvision report.pdf --search "revenue" --format json
pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --format json
```

当 pdfvision 能定位证据时，搜索结果会包含 bbox。把该 bbox 传给 `--render-region`，即可生成用于视觉验证的小裁剪图。

当答案必须绑定到可审计的 PDF 证据时，这个模式很有用：先搜索术语，选择匹配页和 bbox，再渲染最小可用裁剪。

## 扫描页 OCR

```bash
pdfvision scan.pdf --ocr --ocr-lang eng --format json
pdfvision japanese-scan.pdf --ocr --ocr-lang eng+jpn --format json
```

OCR 结果包含文本、置信度、语言和单词框。

OCR 会附在原生文本旁边，不会替换 `pages[].text`。智能体可以先比较原生提取与 OCR，再决定信任哪个证据。

## 表单、链接与注释

```bash
pdfvision form.pdf --layout --form-fields --annotations --links --format json
```

当 PDF 包含 widget 值、复选框、单选组、可见评论、链接，或含义依赖页面位置的表单标签时使用。

## 目录、页码标签与文档功能

```bash
pdfvision document.pdf --page-labels --outline --viewer --layers --format json
```

当 PDF viewer 体验有意义时使用这些选项：不同于物理页码的页码标签、书签、open action、optional content layer 或 viewer preferences。

## 加密 PDF

```bash
pdfvision encrypted.pdf --password your-password --format json
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```

当密码不应出现在 shell 历史或进程参数中时，优先使用 `--password-stdin`。

## 缓存控制

```bash
pdfvision document.pdf --no-cache --json
pdfvision --clear-cache
```

pdfvision 会缓存提取结果、渲染图像、远程下载和 OCR 数据，让智能体重复读取同一 PDF 时更快。对一次性的敏感运行使用 `--no-cache`，用 `--clear-cache` 删除缓存数据。

当应用需要把缓存放在已知目录时，设置 `PDFVISION_CACHE_DIR`：

```bash
PDFVISION_CACHE_DIR=/secure/pdfvision-cache pdfvision document.pdf --json
```

对远程 PDF，`--no-cache` 也会跳过远程 PDF 缓存，并把新下载的字节直接送入提取流程。当 URL 是私有、限时，或可能在没有版本号的情况下变化时，这是最安全的选择。

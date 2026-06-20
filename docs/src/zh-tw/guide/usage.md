---
title: 使用方式
description: 本機 PDF、遠端 PDF、頁碼範圍、渲染、版面、OCR 與加密 PDF 的常見用法。
---

# 使用方式

## 本機 PDF

```bash
pdfvision document.pdf
```

## 遠端 PDF

```bash
pdfvision --remote https://example.com/document.pdf --format json
```

遠端下載會被快取，並在擷取前驗證是否為 PDF。如果 `.pdf` URL 回傳 HTML、登入頁或挑戰頁，pdfvision 會在快取前失敗。

## 頁碼範圍

```bash
pdfvision document.pdf --pages 1-3
pdfvision document.pdf --pages 1,3,5 --format json
```

## 渲染頁面

```bash
pdfvision document.pdf --render --render-output ./images --format json
```

使用 `--render-scale` 控制影像細節：

```bash
pdfvision document.pdf --render --render-scale 3
```

## 擷取版面與視覺結構

```bash
pdfvision document.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

這會加入版面區塊、影像框、向量框、視覺區域與版面警告。

## 只渲染重要區域

```bash
pdfvision document.pdf --render-visual-regions --render-output ./regions --format json
```

當不想渲染整頁，但需要查看圖、表、表單或圖表區域時使用。

## 搜尋並放大

```bash
pdfvision report.pdf --search "revenue" --format json
pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --format json
```

當 pdfvision 能定位證據時，搜尋結果會包含 bbox。把該 bbox 傳給 `--render-region`，即可產生用於視覺驗證的小裁切圖。

## 掃描頁 OCR

```bash
pdfvision scan.pdf --ocr --ocr-lang eng --format json
pdfvision japanese-scan.pdf --ocr --ocr-lang eng+jpn --format json
```

OCR 結果包含文字、信心分數、語言與單字框。

## 加密 PDF

```bash
pdfvision encrypted.pdf --password your-password --format json
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```

當密碼不應出現在 shell 歷史或程序參數中時，優先使用 `--password-stdin`。

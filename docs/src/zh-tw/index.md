---
layout: home
title: pdfvision
titleTemplate: 面向 AI 代理的 PDF 訊號擷取
hero:
  name: pdfvision
  text: 讓 AI 代理具備類似人的 PDF 視覺
  tagline: 從 PDF 中擷取文字、版面、視覺區域、OCR、metadata、警告與頁面渲染影像，讓代理能檢查 PDF 證據，而不是只依賴單一扁平文字流。
  image:
    src: /logo.svg
    alt: pdfvision
  actions:
    - theme: brand
      text: 快速開始
      link: /zh-tw/guide/
    - theme: alt
      text: GitHub
      link: https://github.com/yamadashy/pdfvision
features:
  - title: 面向代理的 PDF 分流
    details: 先讀取低成本的原生文字與逐頁品質訊號，再判斷是否需要渲染、OCR、搜尋或裁切。
  - title: 需要時才提供視覺證據
    details: 渲染整頁、精確區域，或產生圖、圖表、表格、表單、圖示候選區域，交給多模態模型檢查。
  - title: 版面與警告訊號
    details: 保留標題、分欄、表格、表單標籤、連結、註解，以及揭示文字擷取不完整的警告。
---

## 為什麼是 pdfvision

許多 PDF 擷取工具只給代理一段字串，並要求它信任結果。真實文件中，這種方式很容易失敗：雙欄論文、含義藏在形狀裡的投影片、帶圖表和表格的報告、政府表單、帶 OCR 殘留的掃描件，以及文字層包含相容字形或亂碼的多語言 PDF，都不能只看一條扁平文字流。

pdfvision 圍繞一個不同的循環設計：

1. 擷取 PDF 的原生訊號。
2. 判斷這些訊號是否可信。
3. 定位真正重要的證據。
4. 只對需要進一步檢查的頁面或區域進行渲染或 OCR。

這個循環更接近人類閱讀 PDF 的方式。你會先瀏覽頁面，注意視覺頁面和擷取文字是否不一致，放大圖表或表單欄位，並保留可驗證的原始證據。

## 它給代理什麼

pdfvision 在一個 CLI 和 TypeScript 函式庫中組合了代理需要的 PDF 訊號：

- 帶 Unicode 正規化的原生文字，以及可選的 raw text。
- 字元數、影像數、向量數、文字覆蓋率、原生文字狀態等逐頁密度與品質欄位。
- 版面區塊、標題、多欄閱讀順序、直排 CJK、數字表格提示、重複頁首/頁尾偵測。
- 面向視覺模型的頁面 PNG 與目標區域裁切。
- 掃描或影像型頁面的 OCR 文字、信心分數、語言和詞級 bbox。
- 橫跨原生文字、可見表單值、FreeText 註解和 OCR 輸出的搜尋匹配與 bbox。
- 用於圖、圖表、表格、表單和圖示裁切的 raster image box、vector box 和 visual region。
- 按需輸出表單欄位、連結、註解、目錄、頁碼標籤、圖層、viewer 設定、結構樹和附件 metadata。
- 亂碼字形、可疑 OCR 層、密集向量圖、被攤平的表格、重疊文字、頁外內容、隱藏圖層風險、閱讀順序分歧等人類會注意到的警告。

## 快速開始

不用安裝即可執行：

```bash
npx pdfvision document.pdf
```

為多模態模型渲染頁面影像：

```bash
npx pdfvision document.pdf --render
```

從 URL 擷取結構化 JSON：

```bash
npx pdfvision --remote https://raw.githubusercontent.com/mozilla/pdf.js-sample-files/master/tracemonkey.pdf --format json
```

搜尋證據，然後只裁切匹配區域：

```bash
npx pdfvision report.pdf --search "revenue" --json
npx pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --json
```

不渲染每一整頁，也可以檢查視覺結構：

```bash
npx pdfvision slides.pdf --layout --image-boxes --vector-boxes --visual-regions --json
npx pdfvision slides.pdf --render-visual-regions --render-output ./regions --json
```

## 文件

- [快速開始](./guide/) 說明基本流程。
- [使用情境](./guide/use-cases) 將常見 PDF 類型對應到 pdfvision 命令模式。
- [CLI 選項](./guide/command-line-options) 依任務整理主要參數。
- [結構化輸出](./guide/structured-output) 解釋代理和工具會使用的欄位。
- [版面與警告](./guide/layout-and-warnings) 說明應從 README 簡短介紹中分離出來的視覺結構細節。
- [渲染與 OCR](./guide/rendering-and-ocr) 涵蓋影像輸出、區域裁切與掃描文件。
- [搜尋與區域放大](./guide/search-and-region-zoom) 展示如何找到文字證據，並只渲染匹配區域。

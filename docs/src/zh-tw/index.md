---
layout: home
title: pdfvision
titleTemplate: 面向 AI 代理的 PDF 擷取
hero:
  name: pdfvision
  text: 讓 AI 代理具備類似人的 PDF 視覺
  tagline: 從 PDF 中擷取文字、版面、OCR、metadata 與頁面渲染影像，讓代理能檢查證據，而不是只依賴單一扁平文字流。
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
  - title: 文字與視覺證據
    details: 將原生文字、密度訊號、頁面渲染圖、OCR 文字與幾何資訊整合成代理容易使用的結果。
  - title: 理解版面的擷取
    details: 重建行、區塊、表格、表單標籤、註解、連結與視覺區域，同時保留 PDF 的原始訊號。
  - title: 可供代理判斷的警告
    details: 顯示掃描頁、字形亂碼、被攤平的表格、文字重疊、頁首頁尾衝突等人類讀者會注意到的異常。
---

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

## 文件

- [快速開始](./guide/) 說明基本流程。
- [使用情境](./guide/use-cases) 將常見 PDF 類型對應到 pdfvision 命令模式。
- [CLI 選項](./guide/command-line-options) 依任務整理主要參數。
- [結構化輸出](./guide/structured-output) 解釋代理和工具會使用的欄位。
- [版面與警告](./guide/layout-and-warnings) 說明應從 README 簡短介紹中分離出來的視覺結構細節。
- [渲染與 OCR](./guide/rendering-and-ocr) 涵蓋影像輸出、區域裁切與掃描文件。

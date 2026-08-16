---
layout: home
title: pdfvision
titleTemplate: 面向 AI 代理的 PDF 訊號擷取
hero:
  name: pdfvision
  text: 讓悄無聲息的 PDF 失敗變得可以補救
  tagline: 空白掃描件、亂碼字形、錯亂的分欄，回傳時都像是成功的結果。pdfvision 會擷取文字、版面與頁面影像，逐頁標記問題，並指出下一步該怎麼做。
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
  - title: 先查證，再信任
    details: 每一頁回傳的不只是文字，還有品質訊號。警告會指名具體風險——字形亂碼、影像化文字、閱讀順序分歧——並以下一步該做什麼收尾。
  - title: 分階段花用脈絡
    details: 先用低成本的原生文字，再依頁縮小長文件的範圍，只在訊號提示需要細看的地方啟用版面、OCR 或渲染。
  - title: 搜尋、放大、渲染
    details: 先找到文字證據，再只渲染匹配區域——送進視覺模型的是一張小裁切圖，而不是每一頁的影像。
---

## 為什麼是 pdfvision

PDF 擷取最糟糕的一點是：失敗看起來和成功一樣。掃描件回傳空白文字，損壞的字型對應表回傳看似可讀的亂碼，雙欄論文回傳時兩欄交錯——而它們都會作為一次正常、成功的結果回傳。信任了它的代理會給出錯誤答案，卻始終不知道哪裡出了問題。

這個領域的多數工具瞄準的是轉換：把 PDF 變成乾淨的 Markdown，然後期待結果夠忠實。pdfvision 瞄準的是診斷——它逐頁回報擷取結果是否可信，並在不可信的地方取回該處的視覺證據。

它圍繞的循環是：

1. 擷取 PDF 的原生訊號。
2. 判斷這些訊號是否可信。
3. 定位真正重要的證據。
4. 只對需要進一步檢查的頁面或區域進行渲染或 OCR。

這個循環更接近人類閱讀 PDF 的方式：先瀏覽頁面，注意視覺頁面和擷取文字何時不一致，再放大決定答案的那張圖表或那個表單欄位。

## 它給代理什麼

- **每一頁都有品質訊號。** 字元數、影像數、向量數、文字覆蓋率、原生文字狀態，以及針對人類會注意到的線索給出的警告——每則警告都以補救辦法收尾，因此代理不需要理解字型對應表或內容流。
- **只在重要的地方取證據。** 可橫跨原生文字、表單值、註解、連結和 OCR 輸出搜尋；每筆匹配都帶頁碼與 bbox，可直接裁切並渲染。
- **代理能直接使用的結構化輸出。** JSON、Markdown、TOON 與 XML，包含版面區塊、表單欄位、連結、目錄與附件——都是按需開啟，因此預設呼叫保持輕量。

版面重建、OCR、visual region 等其餘能力在[指南](./guide/)中介紹。

## 快速開始

不用安裝即可執行：

```bash
npx pdfvision document.pdf
```

擷取出問題時，頁面自己會說出來。下面的例子裡，文字層把一張圖的標籤解碼成了亂碼，而警告既說明了原因，也指出了因應辦法：

```console
$ pdfvision tracemonkey.pdf -p 10
_chars: 6944 · images: 0 · coverage: 42% · vectors: 17 · warnings: 1 · size: 612×792pt_
… page body …
### Warnings
> **warning** (reading_order_divergence): layout line "?>9@AJ.0A:</C./8-2#3$4%56#" appears
> after "?>9@AJ.D<F@-<>2.@A:0>#3$4,56#" visually but earlier in the native text stream —
> native line order diverges from what a human reads; the body above is that reading order,
> rebuilt from the layout — render the page when exact sequence is critical
```

如果沒有這則警告，代理只會把 `?>9@AJ.0A:</C./8-2#3$4%56#` 當成一次成功的擷取來讀，而且永遠不會發現問題。

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
- [版面與警告](./guide/layout-and-warnings) 深入說明視覺結構訊號。
- [渲染與 OCR](./guide/rendering-and-ocr) 涵蓋影像輸出、區域裁切與掃描文件。
- [搜尋與區域放大](./guide/search-and-region-zoom) 展示如何找到文字證據，並只渲染匹配區域。

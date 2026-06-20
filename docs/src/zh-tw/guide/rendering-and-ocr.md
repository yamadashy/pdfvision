---
title: 渲染與 OCR
description: 使用 pdfvision 渲染整頁、渲染視覺區域，並對掃描 PDF 進行 OCR。
---

# 渲染與 OCR

對於掃描件、投影片、圖表、示意圖、截圖和視覺表單，原生 PDF 文字通常不夠。渲染和 OCR 可以讓頁面可檢查。

pdfvision 把渲染當作證據，而不是最後手段。代理可以先讀取原生文字，發現頁面視覺內容豐富或可疑後，再渲染整頁或小裁切。這讓多模態呼叫更有針對性，也更容易稽核。

## 何時渲染

當頁面含義是視覺性的，或擷取訊號顯示原生文字可能不代表人類看到的內容時，進行渲染。常見觸發條件包括高 image/vector count、有可見內容但文字稀疏、圖表密集頁面、表單、截圖、地圖、投影片，以及關於 OCR 層或 glyph-corrupted text 的 warning。

不需要渲染所有頁面。從 overview 開始，只渲染重要的頁面或區域。

## 渲染整頁

```bash
pdfvision document.pdf --render --render-output ./images --format json
```

每個選中頁面都會得到一個影像路徑。渲染影像使用與版面框一致的左上角座標系，便於把 PDF points 映射到像素。

```bash
pdfvision document.pdf --render --render-scale 3
```

較小倍率減少影像大小，較大倍率更適合小標籤和密集圖表。

適合渲染整頁的情況：

- PDF 是掃描件、投影片、圖表密集報告、截圖、地圖或宣傳冊。
- warning 顯示原生文字稀疏、字形損壞或與視覺不一致。
- 任務依賴精確視覺位置。
- 模型需要檢查頁面外觀，而不只是文字。

影像路徑會回傳在 `pages[].image` 中，代理可以直接傳給支援視覺的模型。

## 渲染一個區域

```bash
pdfvision document.pdf --pages 2 --render --render-region 120,180,360,240 --render-output ./regions
```

`--render-region` 使用 PDF points 和左上角原點。它適合放大由版面區塊、影像框或視覺區域定位到的位置。

搜尋結果的 bbox 也可以使用同一裁切流程。參見 [搜尋與區域放大](./search-and-region-zoom.md)。

區域渲染適用於：

- 驗證一個合約條款或表格儲存格。
- 讀取圖例或座標軸標籤。
- 檢查 checkbox group 或表單值。
- 查看公式、圖題或截圖細節。
- 只把證據區域傳送給視覺模型，減少影像 token。

## 渲染視覺區域

```bash
pdfvision document.pdf --render-visual-regions --render-output ./regions --format json
```

只裁切並渲染圖、圖表、表單、表格與示意圖等重要區域。

當代理還不知道座標時使用。pdfvision 會從 layout、image、vector、annotation 和 form evidence 推斷 visual regions，並把這些區域分別渲染為 PNG。

## OCR

```bash
pdfvision scan.pdf --ocr --ocr-lang eng --format json
```

OCR 輸出包含文字、信心分數、語言和單字框。

多語言頁面使用 `+` 連接語言：

```bash
pdfvision scan.pdf --ocr --ocr-lang eng+jpn --format json
```

當密度訊號或 warning 表明原生文字缺失、稀疏、像掃描件或品質較低時，OCR 最有用。

OCR 不會覆蓋原生文字，而是作為第二種訊號附加。代理可以比較：

- PDF text layer 的原生文字。
- 頁面像素 OCR 出的文字。
- OCR confidence 和 word boxes。
- 頁面 quality 和 warnings。

這種比較對帶隱藏 OCR 層的掃描 PDF 很重要。有些 PDF 的不可見文字層看起來完整，但並不匹配人類看到的頁面。pdfvision 會保留兩種訊號，並在不一致時給出 warning。

## 實用策略

按這個路徑升級：

1. 執行 `pdfvision document.pdf --json`。
2. 如果頁面視覺性強或可疑，執行 `--render`。
3. 如果可見文字缺失於原生擷取，執行 `--ocr`。
4. 如果只有一個區域重要，用 `--search`、`--visual-regions` 或 layout boxes 裁切。
5. 如果小字難讀，提高 `--render-scale`。

當大多數頁面已經可讀時，不需要對每一頁執行 OCR 或整頁視覺模型。

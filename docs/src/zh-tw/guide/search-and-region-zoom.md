---
title: 搜尋與區域放大
description: 使用 pdfvision 搜尋 PDF 文字、表單欄位、註解與 OCR 輸出，再把匹配區域渲染為 PNG 裁切圖供 AI 視覺模型檢查。
---

# 搜尋與區域放大

pdfvision 可以先找到文字證據，再只渲染匹配區域。這適合讓代理驗證條款、表格儲存格、圖中標籤、表單值或 OCR 結果，而不必把整頁影像傳給視覺模型。

這是 pdfvision 中最適合代理的工作流程之一：用文字搜尋作為低成本 locator，然後只在真正重要的位置切換到視覺證據。

## 搜尋 PDF

```bash
pdfvision report.pdf --search "revenue" --json
```

匹配結果會輸出到 `pages[].matches[]`。每個 match 包含頁碼、query、source、文字片段，以及能夠定位可見區域時的 bbox。

重複 `--search` 可以一次執行多個查詢：

```bash
pdfvision paper.pdf --search "transformer" --search "attention" --json
```

預設搜尋是字面量、不區分大小寫且感知 NFKC。只有任務需要時才啟用正規表示式或嚴格大小寫：

```bash
pdfvision report.pdf --search "Q[1-4] revenue" --search-regex --json
pdfvision report.pdf --search "PDF" --search-case-sensitive --json
```

好的搜尋目標包括：

- 合約條款和政策術語。
- 財務指標標籤。
- 表格列名。
- 表單值。
- 圖題和圖表標籤。
- 掃描頁面上的 OCR 文字。
- Unicode 形式可能變化的多語言術語。

## 搜尋涵蓋範圍

搜尋可以匹配：

- PDF 原生文字。
- `--form-fields` 的文字值和 choice 值。
- `--links` 的可點擊 link target。
- `--annotations` 中可見的 FreeText 註解內容。
- `--ocr` 的 OCR 文字，可用時使用 OCR word boxes。

與原生文字、表單欄位、連結或註解重複的 OCR match 會被抑制，因此代理不容易看到同一可見文字的重複結果。

match 的 `source` 幫助代理判斷它應該被多大程度信任：

- `native`：來自 PDF text layer。
- `formField`：來自可見 widget value 或 display value。
- `link`：來自可點擊 link target。
- `annotation`：來自可見 FreeText annotation。
- `ocr`：來自頁面像素，可能需要檢查 confidence。

對於多 query 搜尋，`queryIndex` 可讓呼叫方把每個 hit 映射回產生它的重複 `--search` flag。

## 渲染匹配區域

把 match 的 bbox 傳給 `--render-region`：

```bash
pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --json
```

`--render-region` 要求選中的頁剛好為一頁。區域使用左上原點的 PDF points，並且必須在頁面邊界內。

如果裁切圖包含小標籤、上標、密集表格儲存格或圖表圖例，可以提高 `--render-scale`：

```bash
pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-scale 3 --render-output ./crops --json
```

為了獲得更好的 crop，可在把 match bbox 傳給 `--render-region` 前加一點 padding。少量周邊上下文能幫助視覺模型讀取標籤、列頭和附近說明文字。

## 代理工作流

1. 執行 `--search` 找到候選證據。
2. 查看 `pages[].matches[]`，選擇 page、source 和 bbox 合適的 match。
3. 用 `--pages`、`--render` 和 `--render-region` 重新執行，產生視覺裁切圖。
4. 讓視覺模型把裁切圖與原生文字、OCR 文字或擷取出的表格資料進行對照。

對於無法透過文字搜尋定位的視覺區域，請結合 [渲染與 OCR](./rendering-and-ocr.md) 使用 `--visual-regions` 或 `--render-visual-regions`。

## 範例：可稽核的 claim check

```bash
pdfvision annual-report.pdf --search "Net sales" --search "Operating income" --layout --json
```

代理可以檢查 `pages[].matches[]`，選擇頁面和周邊 context 正確的 hit，然後請求 crop：

```bash
pdfvision annual-report.pdf --pages 42 --render --render-region 72,180,468,180 --render-output ./evidence --json
```

最終答案可以同時引用擷取文字和渲染後的證據區域。

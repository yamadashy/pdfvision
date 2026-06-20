---
title: 版面與警告
description: 理解 pdfvision 的版面重建、視覺區域、幾何資訊與頁面警告。
---

# 版面與警告

PDF 的意義常存在於位置關係中：分欄、標題、表單標籤、表格、註腳、圖、連結、註解、重複頁首或頁尾都會影響閱讀方式。`--layout` 保留這些訊號，而不是把頁面壓平成一個文字流。

對於 AI 代理，這一點很重要，因為看似合理的文字流仍然可能是錯的。雙欄論文可能被跨欄讀取，財務表可能丟失列邊界，表單值可能離開標籤，頁尾可能被誤當正文。pdfvision 暴露版面和 warning 訊號，讓代理能發現這些情況。

## 版面重建

```bash
pdfvision document.pdf --layout --format json
```

版面輸出包括：

- `pages[].layout.lines`: 帶幾何資訊的重建文字行。
- `pages[].layout.blocks`: 依閱讀順序排列的區塊、角色與 bbox。
- `pages[].layout.tables`: 原生文字可能攤平行列關係時的數字表格提示。
- 直排 CJK 文字復原。

當原生文字流與視覺閱讀順序不同，Markdown 輸出可以使用恢復後的 layout order。

需要 layout 的情境：

- 頁面有分欄、側欄、圖題或註腳。
- 任務依賴標題或章節層級。
- 表單標籤必須與值關聯。
- 表格行列很重要。
- 重複的頁面 chrome 不應被當作正文。
- 搜尋結果或擷取欄位需要視覺座標進行驗證。

`layout.blocks` 不是為了隱藏原生文字。它給代理提供帶 geometry 和 role hints 的另一種 reading-order view，同時 `pages[].text` 仍可用於比較。

## 幾何資訊

```bash
pdfvision document.pdf --geometry --format json
```

`--geometry` 在 `pages[].spans` 中輸出更底層的文字項目、bbox 與字級。可用於搜尋標示、覆蓋層與證據映射。

## 視覺框與區域

```bash
pdfvision document.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

重要欄位：

- `pages[].imageBoxes`: raster 影像。
- `pages[].vectorBoxes`: 圖表路徑、表格線、表單框、投影片形狀等向量繪製。
- `pages[].visualRegions`: 圖、圖表、表格、表單與示意圖的可裁切區域。

當代理只需要檢查這些區域時，使用 `--render-visual-regions`。

這是「把一切擷取成文字」和「查看 PDF」之間的關鍵差異。投影片圖表、簽名框、標註圖或表格網格可能沒有多少有用原生文字，但其 image/vector geometry 會告訴代理應該看哪裡。

visual regions 可以作為到多模態模型的橋樑：

1. 用 `--visual-regions` 發現候選區域。
2. 選擇 kind、page、bbox 和關聯文字合適的區域。
3. 重新執行 `--render-region`，或使用 `--render-visual-regions`。
4. 讓視覺模型只檢查該證據區域。

## 頁面警告

`pages[].warnings` 描述在信任原生文字前應檢查的異常。

常見警告包括：

- 文字重疊或文字框超出頁面。
- 正文擠到重複頁首或頁尾附近。
- 被攤平的數字表格。
- 原生文字順序與視覺閱讀順序不一致。
- 字形亂碼、PUA 字串或局部 mojibake。
- 全頁掃描上的 OCR 文字層。
- 掃描頁上的低信心 OCR。
- 內部標籤可能需要視覺模型讀取的大型 raster 區域。
- 表單、圖表或示意圖這樣的密集向量頁面。

警告不是最終判斷，而是告訴代理下一步應檢查哪裡。

## 代理應如何使用警告

把 warning 當作 routing signal：

- 如果原生文字字形損壞，在摘要前先與 render 或 OCR 比較。
- 如果閱讀順序分歧，敘事順序優先使用 layout blocks，而不是 raw page text。
- 如果出現 table warning，保留行列證據；當數值重要時裁切表格。
- 如果出現 large raster 或 dense vector warning，在驗證前假設標籤可能是 visual-only。
- 如果涉及 repeated chrome，避免混合頁首、頁尾、頁碼和正文。

重要習慣不是讓整個擷取失敗，而是讓代理選擇下一步觀察。pdfvision 會返回足夠的證據來支援這個選擇。

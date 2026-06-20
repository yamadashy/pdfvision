---
title: 版面與警告
description: 理解 pdfvision 的版面重建、視覺區域、幾何資訊與頁面警告。
---

# 版面與警告

PDF 的意義常存在於位置關係中：分欄、標題、表單標籤、表格、註腳、圖、連結、註解、重複頁首或頁尾都會影響閱讀方式。`--layout` 保留這些訊號，而不是把頁面壓平成一個文字流。

## 版面重建

```bash
pdfvision document.pdf --layout --format json
```

版面輸出包括：

- `pages[].layout.lines`: 帶幾何資訊的重建文字行。
- `pages[].layout.blocks`: 依閱讀順序排列的區塊、角色與 bbox。
- `pages[].layout.tables`: 原生文字可能攤平行列關係時的數字表格提示。
- 直排 CJK 文字復原。

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

警告不是最終判斷，而是告訴代理下一步應檢查哪裡。

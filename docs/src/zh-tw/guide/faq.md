---
title: FAQ
description: 關於空文字、掃描件、版面、OCR、渲染、快取和密碼的常見問題。
---

# FAQ

## 為什麼擷取文字是空的？

PDF 可能是掃描件、影像密集、加密，或使用自訂字形編碼。請檢查概覽欄位和 `pages[].warnings`，然後嘗試 `--render`、`--ocr` 或 `--layout`。

## 什麼時候使用 `--layout`？

當頁面包含分欄、表格、表單、註腳、重複頁首或頁尾、直排 CJK，或任何位置會改變含義的內容時使用。

## 什麼時候使用 OCR？

當原生文字缺失、稀疏、像掃描頁，或與渲染影像明顯不一致時使用 `--ocr`。

## pdfvision 使用什麼座標系？

bbox 使用 PDF user-space points，左上角為原點。`x` 向右增加，`y` 向下增加。

## 快取在哪裡？

結果快取在作業系統暫存目錄中。設定 `PDFVISION_CACHE_DIR=/path` 可以覆蓋位置，使用 `--no-cache` 可以跳過快取，執行 `pdfvision --clear-cache` 可以清除快取。

## PDF 密碼應該如何傳遞？

優先使用 `--password-stdin`，避免密碼出現在程序參數中：

```bash
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```

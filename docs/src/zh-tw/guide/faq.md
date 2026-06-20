---
title: FAQ
description: 關於空文字、掃描件、版面、OCR、渲染、快取和密碼的常見問題。
---

# FAQ

## pdfvision 是 PDF 轉文字工具，還是視覺工具？

兩者都是，但核心概念是證據。pdfvision 會在可用時擷取原生文字，同時暴露版面、影像/向量幾何資訊、警告、渲染影像、OCR、搜尋匹配和 PDF 特性中繼資料，讓 agent 判斷只靠文字是否足夠。

## 為什麼擷取文字是空的？

PDF 可能是掃描件、影像密集、加密，或使用自訂字形編碼。請檢查概覽欄位和 `pages[].warnings`，然後嘗試 `--render`、`--ocr` 或 `--layout`。

如果頁面有 `empty_but_visual_content`，請渲染或 OCR。若存在字形相關警告，請在信任原生文字前與渲染頁面或 OCR 結果比較。

## 什麼時候使用 `--layout`？

當頁面包含分欄、表格、表單、註腳、重複頁首或頁尾、直排 CJK，或任何位置會改變含義的內容時使用。

`--layout` 對論文、報告、財務報表、表單和投影片匯出尤其有用，因為這些 PDF 的原始文字流可能與視覺閱讀順序不同。

## 什麼時候使用 OCR？

當原生文字缺失、稀疏、像掃描頁，或與渲染影像明顯不一致時使用 `--ocr`。

OCR 會新增在原生文字旁邊，而不是取代原生文字。Agent 應比較原生文字、OCR 文字、信心分數和警告。

## 什麼時候只渲染區域而不是整頁？

在搜尋、版面、影像 bbox、向量 bbox 或 visual regions 找到關鍵區域後使用 `--render-region`。當模型只需要驗證一個條款、表格儲存格、圖表標籤、表單值或圖形時，裁切通常比整頁渲染更合適。

## visual regions 是什麼？

Visual regions 是可裁切的頁面區域，可能包含有意義的圖形、圖表、表格、表單區塊、註解、示意圖，或點陣/向量聚集區域。它們幫助 agent 在把影像傳送給 vision model 前先發現該看哪裡。

## pdfvision 可以搜尋 PDF 嗎？

可以。`--search` 會輸出 `pages[].matches[]`，包含頁碼、source、匹配文字、上下文，以及可用的 bbox。搜尋可以涵蓋原生文字、可見表單欄位值、FreeText 註解，以及啟用 OCR 後的 OCR 輸出。

## pdfvision 使用什麼座標系？

bbox 使用 PDF user-space points，左上角為原點。`x` 向右增加，`y` 向下增加。

## 快取在哪裡？

結果快取在作業系統暫存目錄中。設定 `PDFVISION_CACHE_DIR=/path` 可以覆蓋位置，使用 `--no-cache` 可以跳過快取，執行 `pdfvision --clear-cache` 可以清除快取。

## PDF 密碼應該如何傳遞？

優先使用 `--password-stdin`，避免密碼出現在程序參數中：

```bash
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```

## 應該使用哪種輸出格式？

快速人工閱讀使用 Markdown，工具和 agent 控制使用 JSON，面向標籤的提示詞使用 XML，結構化輸出很大且 token 預算緊張時使用 TOON。

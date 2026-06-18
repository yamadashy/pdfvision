---
title: 提示詞範例
description: 使用 pdfvision 輸出讓 AI 代理檢查 PDF、驗證版面、擷取表格、讀取掃描件和分析表單的提示詞模板。
---

# 提示詞範例

在產生 pdfvision Markdown、XML、JSON 或 TOON 輸出後，可以使用這些提示詞。

## PDF 初步檢查

```text
請逐頁審查這份 pdfvision 輸出。

對每一頁：
1. 總結可見內容。
2. 在信任原生文字之前檢查 overview quality 欄位和 warnings。
3. 找出需要 render、OCR 或區域級檢查的頁面。
4. 回傳簡潔的行動計畫，並給出下一步要執行的 pdfvision 參數。
```

## 依賴版面的擷取

```text
請使用 pdfvision layout blocks 和 warnings 重建人類閱讀順序。

重點關注：
1. 標題和章節層級。
2. 多欄閱讀順序。
3. 含義依賴位置關係的表格或表單標籤。
4. 表示原生文字順序與視覺順序不一致的警告。
```

## 表格審查

```text
請從這份 pdfvision JSON 中擷取表格。

對每個表格：
1. 優先使用 pages[].layout.tables。
2. 保留行列關係。
3. 標出含義不明確或需要渲染裁切圖確認的儲存格。
4. 包含頁碼和 bbox 證據。
```

## 表單分析

```text
請使用 pdfvision form fields 和 layout data 分析這個 PDF 表單。

回傳：
1. 可見欄位的標籤、值和欄位類型。
2. 核取方塊或單選按鈕群組及其選取狀態。
3. hidden、read-only、required 或 no-view 欄位。
4. 標籤關係不明確、需要裁切圖確認的欄位。
```

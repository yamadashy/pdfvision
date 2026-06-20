---
title: 提示詞範例
description: 使用 pdfvision 輸出讓 AI 代理檢查 PDF、驗證版面、擷取表格、讀取掃描件和分析表單的提示詞模板。
---

# 提示詞範例

在產生 pdfvision Markdown、XML、JSON 或 TOON 輸出後，可以使用這些提示詞。

這些提示詞假設模型應把 pdfvision 輸出當作證據，而不是最終答案。多數工作流程中，模型應判斷 PDF 是否需要下一輪 layout、rendering、OCR、search 或 region crops。

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

存在 layout warnings 時，不要只依賴 pages[].text。
```

## Evidence-First Summary

```text
請使用 pdfvision 輸出作為證據總結這個 PDF。

規則：
1. 從 overview quality fields 和 page warnings 開始。
2. 對原生文字 empty、sparse 或 glyph-corrupted 的頁面，不要在不說明缺失證據的情況下總結。
3. 當結論依賴表格、表單欄位、圖表或圖片時，引用 page 和 bbox，或建議 crop command。
4. 區分可由文字確認的結論和需要視覺驗證的結論。
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

## 財務指標驗證

```text
請使用這份 pdfvision 輸出驗證財務指標。

對每個請求的指標：
1. 在 pages[].matches 或 layout table labels 中尋找候選。
2. 確定 page、row/column context 和 bbox evidence。
3. 檢查 table flattening、reading-order divergence、dense vectors 或 raster-only content warnings。
4. 如果值是視覺編碼的或不明確，回傳用於產生最小可用裁切的 pdfvision --render-region 命令。
5. 當 row 或 column alignment 不清楚時，不要從附近文字編造數值。
```

## 掃描文件 OCR

```text
請比較這份 pdfvision 輸出中的 native text 和 OCR text。

對每一頁：
1. 使用 quality.nativeTextStatus 和 quality.visualStatus 對頁面分類。
2. 只有 native text 可用時才優先使用它。
3. 只有 native text empty、sparse 或 glyph-corrupted 時才優先使用 OCR。
4. 標出 low-confidence OCR 或需要更高解析度 render 的頁面。
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

## 視覺報告審查

```text
請使用 pdfvision 輸出審查這份視覺 PDF 報告。

重點關注：
1. imageCount 或 vectorCount 較高的頁面。
2. pages[].visualRegions 及其 associated text。
3. 表示 visual-only labels、dense charts 或 sparse native text 的 warnings。
4. 驗證重要 chart、diagram 或 screenshot 所需的最小 region crops。

在做視覺結論之前，先回傳建議的 crop commands。
```

## 搜尋後放大證據檢查

```text
請使用這份 pdfvision JSON 中的 pages[].matches 選擇最合適的證據位置。

對每個相關 match：
1. 回報 page、query、source、matched text 和 bbox。
2. 判斷是否需要視覺驗證。
3. 如果需要，回傳包含 --pages、--render 和 --render-region 的精確 pdfvision 命令。
4. 裁切圖產生後，將其與原生文字、OCR 文字和附近 layout blocks 對照。
```

## 模型特定說明

- 需要精確欄位的工具和代理使用 JSON。
- 目標模型適合明確標籤時使用 XML。
- structured arrays 很大且 token budget 重要時使用 TOON。
- 人類可讀的第一遍使用 Markdown。
- 當結論依賴視覺頁面而不只是 text layer 時，使用 rendered crops。

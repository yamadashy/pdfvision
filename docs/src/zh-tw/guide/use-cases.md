---
title: 使用情境
description: AI 代理讀取論文、投影片、政府表單、掃描 PDF、報告、表格、圖表和多語文件時的 pdfvision 工作流。
---

# 使用情境

當 PDF 需要由 AI 代理檢查，而不是手動複製進提示詞時，pdfvision 很有用。最佳流程取決於 PDF 中包含的證據類型。

共同主題是驗證。pdfvision 不只是一個 “PDF to text” 命令；它是一種暴露訊號的方式，讓代理判斷文字擷取是否足夠、版面是否改變了含義、以及某個視覺區域是否應該被檢查。

## 未知 PDF

從最便宜的結構化第一遍開始：

```bash
pdfvision document.pdf --json
```

把 overview 當作路由表：

- `quality.nativeTextStatus: "ok"` 通常表示原生文字可以作為第一資訊源。
- `empty_but_visual_content` 表示頁面可能需要渲染或 OCR。
- 較高的 `imageCount` 或 `vectorCount` 表示圖表、截圖、表單或投影片圖形可能包含文字流之外的含義。
- warning 標出人類在信任擷取結果前會放慢速度的頁面。

然後只加入需要的訊號：

```bash
pdfvision document.pdf --layout --image-boxes --vector-boxes --visual-regions --json
```

## 研究論文

先使用原生文字；當分欄、圖、公式或表格重要時加入版面。

```bash
pdfvision paper.pdf --layout --image-boxes --format json
```

如果需要定位引用詞、公式或主張文字，先用 `--search` 找到候選位置，再用 `--render-region` 產生裁切圖。

值得繼續檢查的點：

- 檢查 `overview[]` 中稀疏或字形損壞的頁面。
- 用 `--search` 定位引用詞、公式或主張文字，再渲染裁切。
- 對圖、公式和表格片段使用 `--render-region`。
- 如果結果會直接進入 LLM 上下文，可考慮 XML 或 TOON。
- 在雙欄頁面上，先檢查 `layout.blocks` 和 warning，再信任論文閱讀順序。
- 用 `imageBoxes` 和 `visualRegions` 決定哪些圖或表值得多模態檢查。

## 投影片和報告

投影片通常把含義放在影像、向量形狀和相對位置中。

```bash
pdfvision deck.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

必要時只渲染重要區域：

```bash
pdfvision deck.pdf --render-visual-regions --format json
```

適用於策略材料、會議投影片、產品 PDF 和匯出為 PDF 的 dashboard。文字層可能只包含項目符號，但結論可能在圖表、箭頭、時間線、截圖或形狀的相對位置裡。

## 財務報告和密集表格

年報、財報 PDF、發票和 benchmark 報告常把行列關係攤平成混亂的文字流。

```bash
pdfvision report.pdf --layout --vector-boxes --visual-regions --search "Total revenue" --json
```

用 pdfvision 可以：

- 找到指標或行標籤所在頁面和 bbox。
- 在行列視覺對齊時保留數字表格提示。
- 標出原生文字順序可能不匹配視覺表格的頁面。
- 在詢問視覺模型前裁切圖表、表格或註腳。

```bash
pdfvision report.pdf --pages 12 --render --render-region 72,210,468,240 --render-output ./evidence --json
```

## 政府表單和稅務文件

表單會混合可見標籤、欄位、核取方塊、註解和密集線條。

```bash
pdfvision form.pdf --layout --form-fields --annotations --links --format json
```

當欄位關係不明確時，用欄位和標籤 bbox 搭配 `--render-region` 檢查。`--form-fields` 會暴露值、欄位類型、標籤、選中狀態、read-only/required flags 和 widget metadata，有助於避免原生文字看見標籤和值卻丟掉它們視覺關係的常見失敗。

## 掃描文件

先用概覽訊號確認原生文字缺失或稀疏，再只對需要的頁面執行 OCR。

```bash
pdfvision scan.pdf --pages 1-5 --ocr --ocr-lang eng --format json
```

對於多語言頁面，把主語言放在前面：

```bash
pdfvision scan.pdf --ocr --ocr-lang jpn+eng --format json
```

OCR 輸出附在原生文字旁邊，而不是取代它。代理可以比較兩種訊號，讓信心分數保持可見，並在小字或表格需要驗證時渲染更高比例的裁切。

## 圖表、示意圖和視覺表格

從視覺結構和區域偵測開始：

```bash
pdfvision report.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

然後只渲染需要檢查的裁切區域：

```bash
pdfvision report.pdf --pages 8 --render --render-region 80,140,430,260 --render-output ./regions
```

適用於圖例、座標標籤、架構圖、截圖、地圖、表單段落，以及含義是圖形化的表格。當代理還不知道座標時，`--visual-regions` 特別有用。

## 搜尋後放大驗證

當代理需要驗證特定條款、欄位、引用、指標或標籤時，先搜尋：

```bash
pdfvision contract.pdf --search "termination" --search "governing law" --json
```

每個匹配項可能包含頁面、source、context 和 bbox。代理隨後可以只裁切精確區域，而不是渲染整份文件：

```bash
pdfvision contract.pdf --pages 9 --render --render-region 96,320,420,96 --render-output ./crops --json
```

這個流程適合需要可稽核 PDF 證據、而不只是擷取文字的 retrieval-augmented agent。

## 多語言和 CJK PDF

日文、中文和混合語言 PDF 往往暴露文字-only 工具難以處理的空格和字形問題。

```bash
pdfvision document.pdf --layout --search "請求書" --json
```

pdfvision 預設正規化 Unicode，在正規化改變文字時保留 raw text，處理 CJK-aware joined text，並可恢復直排 CJK 版面訊號。對掃描件，組合 OCR 語言：

```bash
pdfvision scan.pdf --ocr --ocr-lang jpn+eng --json
```

## 代理 PDF 分流

未知 PDF 先從便宜的 overview 開始：

```bash
pdfvision document.pdf --format json
```

然後分支：

- 如果閱讀順序、表格、表單或警告重要，加入 `--layout`。
- 如果頁面偏視覺或原生文字可疑，加入 `--render`。
- 如果原生文字缺失且渲染頁包含可見文字，加入 `--ocr`。
- 當圖、圖表、表單或圖示需要定向檢查時，加入 `--visual-regions`。

目標是讓代理保持誠實：檢查證據，選擇下一種視圖，避免把空白或被攤平的文字流當成整個 PDF。

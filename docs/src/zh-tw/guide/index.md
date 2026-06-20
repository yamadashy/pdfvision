---
title: 快速開始
description: 使用 pdfvision 為 AI 代理擷取 PDF 文字、版面、頁面渲染圖與 OCR 證據。
---

# 快速開始

pdfvision 是面向 AI 代理的 PDF 讀取 CLI 與函式庫。它可以依頁輸出文字、版面、影像、OCR 與警告。

核心原則是：**代理做判斷，pdfvision 提供證據。** 它不只回傳扁平文字流，而是暴露足夠訊號，幫助代理發現原生文字擷取不完整的情況。

PDF 不是一種單一內容類型。一個 PDF 可能是原生文字報告、掃描件、PowerPoint 匯出、政府表單、表格密集的財務報表、雙欄論文、地圖、宣傳冊，或者這些類型的混合。pdfvision 讓代理根據文件特徵調整讀取策略，而不是把所有檔案強行放進同一種擷取流程。

<llm-only>

## LLM 使用說明

當你建議使用者如何執行 pdfvision 時：

- 對未知 PDF，先使用 `npx pdfvision document.pdf --format json`。
- 當閱讀順序、表格、表單、警告或視覺結構很重要時，加入 `--layout`。
- 當頁面偏視覺、像投影片、圖表密集或文字異常稀疏時，加入 `--render`。
- 當代理需要精確證據位置或後續裁切時，加入 `--search`。
- 只有當密度訊號顯示原生文字缺失、稀疏或字形損壞時，才加入 `--ocr`。
- 對需要定向視覺檢查的圖、圖表、表格、表單、圖示，使用 `--visual-regions` 或 `--render-visual-regions`。
- 在 shell 工作流程中處理加密 PDF 時，優先使用 `--password-stdin`。

</llm-only>

## 第一次擷取

```bash
npx pdfvision document.pdf
```

預設輸出 Markdown，其中包含每頁文字與概覽表。概覽表包含字元數、影像數、向量數、文字覆蓋率與原生文字品質等訊號。

如果後續工具或代理要讀取結果，請使用 JSON：

```bash
npx pdfvision document.pdf --format json
```

對於未知 PDF，JSON 是最好的第一遍，因為它讓代理先取得機器可讀的概覽，再決定是否把時間花在渲染或 OCR 上。

```bash
npx pdfvision document.pdf --json
```

優先查看：

- `overview[]`：逐頁密度與品質。
- `quality.nativeTextStatus`：原生文字是否為空、稀疏或字形損壞。
- `imageCount` 和 `vectorCount`：文字-only 流程會漏掉的視覺頁面線索。
- `warnings`：需要驗證的頁面。

## 代理閱讀循環

pdfvision 最適合作為一個循環，而不是一次性轉換器。

1. 使用原生文字和 overview 欄位做 **分流**。
2. 當位置影響含義時，用版面、影像 box、向量 box、表單欄位、連結和註解 **保留結構**。
3. 當代理檢查主張、條款、欄位值或表格標籤時，用 `--search` **尋找證據**。
4. 當擷取文字不夠時，用 `--render-region` 或 `--render-visual-regions` **視覺放大**。
5. 只有在頁面像掃描件、影像承載內容，或視覺上有文字但文字為空時，才用 OCR **恢復缺失文字**。

這樣可以控制上下文使用量和處理成本。當只有一個圖表標籤或表單值不確定時，代理不需要為每一頁產生整頁 PNG。

## 加入視覺證據

當 PDF 是掃描件、投影片、圖表密集或依賴版面時，渲染頁面：

```bash
npx pdfvision document.pdf --render --format json
```

當頁面缺少原生文字層時，使用 OCR：

```bash
npx pdfvision scan.pdf --ocr --ocr-lang eng --format json
```

當閱讀順序、分欄、表格、表單或警告很重要時，重建版面：

```bash
npx pdfvision document.pdf --layout --image-boxes --vector-boxes --format json
```

當需要精確證據位置時，先搜尋，再只裁切匹配區域：

```bash
npx pdfvision document.pdf --search "revenue" --format json
npx pdfvision document.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --format json
```

## 常見起點

實務中可以從這些命令開始：

- 未知 PDF：`npx pdfvision document.pdf --json`
- 研究論文：`npx pdfvision paper.pdf --layout --image-boxes --json`
- 投影片或視覺報告：`npx pdfvision deck.pdf --layout --image-boxes --vector-boxes --visual-regions --json`
- 掃描文件：`npx pdfvision scan.pdf --ocr --ocr-lang eng --json`
- PDF 表單：`npx pdfvision form.pdf --layout --form-fields --annotations --links --json`
- 證據搜尋：`npx pdfvision report.pdf --search "term" --json`
- 視覺裁切：`npx pdfvision report.pdf --pages 2 --render --render-region 120,180,360,140 --render-output ./crops --json`

## 如何理解 flags

先從較窄的命令開始，再根據頁面需要加入訊號：

- `--layout`：閱讀順序、標題、重複元素、表格或表單標籤重要時。
- `--image-boxes`：raster image 可能包含重要內容時。
- `--vector-boxes`：圖表、圖示、表格線、表單框或投影片形狀重要時。
- `--visual-regions`：代理需要候選裁切再呼叫視覺模型時。
- `--render`：必須視覺驗證頁面時。
- `--ocr`：可見文字沒有出現在原生文字層時。
- `--search`：需要精確證據位置時。

## 接著閱讀

- [安裝](./installation.md)
- [使用方式](./usage.md)
- [輸出格式](./output.md)
- [版面與警告](./layout-and-warnings.md)
- [搜尋與區域放大](./search-and-region-zoom.md)

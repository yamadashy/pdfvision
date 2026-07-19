---
title: 結構化輸出
description: 理解 pdfvision 的 DocumentResult、PageResult、overview、quality、layout、OCR、warnings、座標和可選 PDF 功能欄位。
---

# 結構化輸出

`--format json` 序列化 `DocumentResult`。每個成功輸出的 `--format toon` 在解碼後都與 JSON 的 parse 結果完全一致，未設定的 `undefined` 保持不存在。TOON 無法讓未配對的 UTF-16 代理項無損通過 UTF-8 邊界，因此此邊界情況會報錯並要求使用 JSON；有效的代理項配對和字面值 backslash-u 文字不受影響。XML 是用於呈現的標籤形 near-parity projection，不是可逆的 `DocumentResult` 序列化。Markdown 會刻意轉換或省略欄位。

該 schema 被設計成代理的 evidence model。它不只說「這裡是文字」，還會說明找到了多少文字、頁面上有哪些視覺材料、原生文字是否可信、證據出現在頁面的哪裡，以及請求到的 PDF 功能欄位是否存在。

## 格式契約

本頁的 JSON 風格路徑僅對 JSON、解碼後的 TOON 和 `processDocument()` 精確有效。XML 將 `page` 對應為 `no`、`pageLabel` 對應為 `label`，並將巢狀 `quality` 展平為屬性。頁面結果保留 rotation 屬性，overview rotation 目前省略，空欄位的存在方式也可能不同。

JSON 和成功輸出的 TOON 精確使用 `pages[].rawText` 和 `layout.blocks[].repeated`；XML 使用同層 `<rawText>` 和 `<block repeated="true">`；Markdown 省略 `rawText`，僅在指定 `--strip-repeated` 時移除重複區塊。JSON/TOON 使用頂層 `xfa`，XML 使用 `<document xfa="true">`。XML 1.0 禁止的程式碼單元會表示為 `[[pdfvision:U+XXXX]]`，原文中的 `[[pdfvision:` 前綴則轉義為 `[[pdfvision:literal:`，因此這種表示不會產生歧義。

## 頂層結構

```ts
interface DocumentResult {
  file: string;
  totalPages: number;
  metadata: DocumentMetadata;
  overview?: PageOverview[];
  pages: PageResult[];
}
```

按需出現的頂層欄位包括：

- `pageLabels`：`--page-labels`。
- `attachments`：`--attachments`。
- `outline`：`--outline`。
- `viewer`：`--viewer`。
- `layers`：`--layers`。

## Page Overview

`overview[]` 是代理首先應該檢查的位置。

- `charCount`
- `imageCount`
- `vectorCount`
- `textCoverage`
- `nonPrintableRatio`
- `renderContentRatio`
- `quality`
- warning 和 match 計數

它用於發現原生文字為空、稀疏、與視覺矛盾或字形損壞的頁面。

在長文件中，overview 尤其有用，因為它能讓代理只選擇少量頁面進行深入檢查。

- 文字少而 image/vector 多的頁面，可能是圖表、投影片、掃描件或表單。
- 有 warning 的頁面，在摘要前應該先驗證。
- 有 search match 的頁面可以直接裁切為視覺證據。
- visual status 為空白或稀疏的頁面，可能不值得升級到 OCR。

## Page Result

每個 `pages[]` 項目包含 `text`、`rawText`、頁面尺寸、密度欄位，以及按需出現的 `spans`、`layout`、`imageBoxes`、`vectorBoxes`、`visualRegions`、`formFields`、`links`、`annotations`、`structure`、`ocr`、`warnings` 和 `matches`。

OCR 不會覆蓋原生文字。使用方應比較 `page.text` 與 `page.ocr?.text` 後再選擇。

可選欄位是有意 opt-in 的。`--layout --form-fields` 的 JSON 與沒有請求這些 flags 的 JSON 不同。當請求了某個功能但沒有找到元素時，pdfvision 會盡量使用空陣列或 null-like 結構，幫助消費者區分「未請求」和「請求了但不存在」。

## Quality Fields

`quality.nativeTextStatus` 描述原生文字層：

- `ok`
- `mixed_glyph_indices`
- `unusable_glyph_indices`
- `sparse_text_on_blank_visual`
- `sparse_text_with_visual_content`
- `empty_but_visual_content`
- `empty`

`quality.visualStatus` 在渲染或 OCR 產生 raster 後出現：

- `ok`
- `sparse`
- `blank`

這些欄位是觀察值，不是命令。代理決定是否渲染、OCR、裁切或信任原生文字。

實用解讀：

- `ok`：原生文字通常可以作為第一來源。
- `mixed_glyph_indices` 或 `unusable_glyph_indices`：信任文字前先用渲染或 OCR 驗證。
- `sparse_text_with_visual_content`：頁面可能有未進入文字層的視覺含義。
- `empty_but_visual_content`：通常需要渲染或 OCR。
- `sparse_text_on_blank_visual`：文字層可能包含不可見殘留。
- `visualStatus: "blank"`：raster 沒有顯示可見內容。

## 座標

所有 bbox 使用未旋轉的 pdf.js `page.view` 可見框 PDF user-space units，並以左上角為原點。存在有效 CropBox 時，該框是 CropBox ∩ MediaBox，否則是 MediaBox。`pages[].width` / `height`、零基準座標和 `renderRegion` 邊界均相對於此框。預設 `/UserUnit` 下通常是點，而不是 PNG 像素。bbox 可原樣傳給 `--render-region`；整頁 PNG 疊加在未旋轉頁按影像/頁面尺寸縮放，在旋轉頁使用 pdf.js 的旋轉 viewport transform。

帶座標的欄位包括 spans、layout blocks/lines、image boxes、vector boxes、visual regions、form fields、links、annotations、structure references、OCR words 和 search matches。代理可以從結構化擷取直接跳到視覺裁切，而不需要發明新的座標系。

## 依任務理解證據欄位

- 文字閱讀：`pages[].text`、`rawText`、`quality`、`warnings`。
- 版面敏感閱讀：`layout.lines`、`layout.blocks`、`layout.tables`、`spans`。
- 視覺檢查：`image`、`renderContentRatio`、`imageBoxes`、`vectorBoxes`、`visualRegions`。
- 掃描恢復：`ocr.text`、`ocr.confidence`、`ocr.words`、`quality.visualStatus`。
- 證據搜尋：`matches[].source`、`matches[].bbox`、`matches[].context`。
- 表單分析：`formFields`、labels、values、selected state、flags、actions。
- 導覽和文件功能：`pageLabels`、`outline`、`links`、`viewer`、`layers`、`structure`。
- 檔案清單：`attachments` metadata 和顯式擷取的 attachment paths。

對代理工作流程來說，關鍵是保留支援結論的欄位。如果摘要依賴表格儲存格，就保留頁碼和 bbox。如果使用了 OCR，就保留信心分數和裁切圖。如果 warning 改變了擷取策略，就保留 warning code。

## 可選 PDF 功能欄位

許多 PDF 的意義位於純文字流之外。pdfvision 讓這些功能保持 opt-in，以便輕量擷取仍然很小，但在 viewer 體驗有意義的文件中它們非常重要。

使用 `--form-fields` 處理申請表、問卷和政府表單。它暴露 widget type、value、checked state、choices、flags、export values、actions、bbox 和附近標籤，常用於區分空框、已選核取方塊和可見 choice field。

使用 `--links` 與 `--outline` 處理導覽密集的文件。links 是帶 bbox 與 target 的頁面級 annotation，outline 是保留層級和 resolved destination 的文件級書籤。即使未請求 link output，link targets 也會被 `--search` 搜尋。它們適用於引用、目錄、手冊和「指向哪裡」也是證據一部分的報告。

使用 `--annotations` 處理評論、高亮、stamp、ink、shape、file-attachment icons 或可見 FreeText notes 可能改變頁面含義的情況。FreeText annotations 也會被 `--search` 搜尋，因為它們可能對人類可見，卻不在 `pages[].text` 中。

使用 `--viewer`、`--page-labels`、`--layers` 處理 PDF viewer state 有意義的情況。這些欄位可以顯示不同於實體頁碼的頁碼標籤、open actions、viewer preferences、optional content groups、預設圖層可見性和文件權限 flags。把它們視為關於 PDF 的觀察值，而不是要執行的指令。

使用 `--structure` 處理 tagged PDF 可能包含 accessibility roles、figure alt text、language hints 或邏輯分組的情況。tagged structure 由 PDF 作者提供，準確性重要時應與可見頁面證據比對。

使用 `--attachments` 處理帶附件面板、頁面 file-attachment icons 或補充檔案的 PDF。結構化輸出包含附件 metadata 與大小；只有顯式提供 `--attachment-output` 時才寫出 bytes。附件路徑只是檔案被擷取的證據，不代表這些檔案可以安全開啟。

## 詳細 schema

TypeScript 套件匯出完整 schema 型別，包括 `DocumentResult`、`PageResult`、`PageWarning`、`LayoutBlock`、`LayoutLine`、`TextSpan`、`ImageBox`、`VectorBox`、`VisualRegion`、`FormField`、`PageOcr` 和 `ProcessDocumentOptions`。

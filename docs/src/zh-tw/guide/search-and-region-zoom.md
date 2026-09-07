---
title: 搜尋與區域放大
description: 使用 pdfvision 搜尋 PDF 文字、表單欄位、註解與 OCR 輸出，再把匹配區域渲染為 PNG 裁切圖供 AI 視覺模型檢查。
---

# 搜尋與區域放大

pdfvision 可以先找到文字證據，再只渲染匹配區域。這適合讓代理驗證條款、表格儲存格、圖中標籤、表單值或 OCR 結果，而不必把整頁影像傳給視覺模型。

這是 pdfvision 中最適合代理的工作流程之一：用文字搜尋作為低成本 locator，然後只在真正重要的位置切換到視覺證據。

## 搜尋 PDF

```bash
pdfvision report.pdf --search "revenue" --matches-only --json
```

With `--matches-only`, JSON and TOON emit compact hits in the top-level `matches[]` array without page bodies. Each hit includes its page, `queryIndex` linked to the top-level `queries` array, source, text, optional context, tight `bbox`, and crop-ready `region`. Without `--matches-only`, full JSON and TOON keep hits in `pages[].matches[]` alongside the page payload; those full hits include `bbox`, but not `region`.

Full Markdown output still shows a per-page `Search matches` table when `--search` is used. With `--matches-only`, Markdown becomes a compact flat report, while JSON, XML, or TOON remain the better choice when another tool needs to consume coordinates directly.

If any selected page has a non-default PDF `/UserUnit`, the compact report preserves it as `pageUserUnits: [{ page, userUnit }]` in JSON/TOON, equivalent `<pageUserUnits>` entries in XML, and a `Page UserUnits` summary in Markdown. The metadata is omitted when every selected page uses UserUnit 1.

Compact output still retains optional diagnostics for every selected page with warnings or non-OK native or visual quality, including pages with no hits and searches with zero total results. JSON/TOON expose `pageDiagnostics` with raw quality and complete warnings; XML and Markdown present the same information in compact diagnostic sections. Inspect it before treating a hit or miss as visible evidence. Native quality describes native text only and does not rule out OCR or field hits. When applicable, `unreadableSource` keeps document-wide XFA placeholder scope and recovery guidance; rendering a confirmed XFA placeholder only renders the placeholder, so open it in Adobe Acrobat/Reader instead.

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
- `--form-fields` 的文字值、choice 值，以及 checkbox / radio 的 export value。
- `--links` 的可點擊 link target。
- `--annotations` 中可見的 FreeText 註解內容。
- `--ocr` 的 OCR 文字，可用時使用 OCR word boxes。

與原生文字、表單欄位、連結或註解重複的 OCR match 會被抑制，因此代理不容易看到同一可見文字的重複結果。連結 hit 只有在可見錨點文字本身就是 target 的複述時（例如 URL 原樣印在頁面上）才會被同樣抑制；如果錨點文字只是與 target 共用一個詞的正文，兩個 hit 都會保留，因為句子和連結目標是不同的證據。

原生 hit 的 `context` 引用的是頁面正文呈現出的同一行——這一點對由右至左的文字尤其重要，重建會補上原始 match 文字缺少的詞間空格與括號方向。只有當該行明確屬於這個 match（覆蓋 match 框的大部分且包含匹配到的字串）時才會引用；跨行拼接的命中，或被重建分配到別處的命中，會回退到一直以來的原始 span 拼接 context。

match 的 `source` 幫助代理判斷它應該被多大程度信任：

- `native`：來自 PDF text layer。
- `formField`：來自可見 widget value、display value 或 checkbox / radio 的 export value。
- `link`：來自可點擊 link target。
- `annotation`：來自可見 FreeText annotation。
- `ocr`：來自頁面像素，可能需要檢查 confidence。

對於多 query 搜尋，`queryIndex` 可讓呼叫方把每個 hit 映射回產生它的重複 `--search` flag。

## 渲染匹配區域

`bbox` locates the matched text itself. The compact hit's `region` optionally expands that box to a detected containing table row or visual line, then adds padding and clamps the result within the page. Without a containing structure, it is the padded match geometry. The crop provides nearby visual evidence, but it does not guarantee that an entire table, all headers, or relevant footnotes are included. Compact search computes this region internally, so it does not need `--layout`.

Choose a compact hit by its `page`, `source`, and `context`, then pass its `region` unchanged. For example, if the chosen hit reports the illustrative values `page: 3` and `region: { x: 120, y: 180, width: 360, height: 140 }`, run:

```bash
pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --json
```

`--render-region` requires exactly one selected page. The region uses raw unrotated page-view units with a top-left origin; compact regions are already clamped, while a custom region must stay within the page bounds. Physical points = raw value × UserUnit; pixels = raw region × UserUnit × render scale. Read UserUnit from `pages[].userUnit` in the full report or the selected page's `pageUserUnits` entry in the compact report (1 when omitted).

Use `--render-scale` when the crop contains small labels, superscripts, dense table cells, or chart legends:

```bash
pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-scale 3 --render-output ./crops --json
```

Start with the emitted `region` unchanged. If the task needs different context, a custom narrower or wider crop remains available within the page bounds.

## 代理工作流

1. Run `--search "…" --matches-only --json` to locate candidate evidence without page bodies.
2. Inspect top-level `matches[]` and choose the hit with the right page, source, and context.
3. Re-run with exactly that hit's `page` and unchanged `region` in `--pages`, `--render`, and `--render-region`.
4. Ask the vision model to compare the crop against the native text, OCR text, or extracted table data.

對於無法透過文字搜尋定位的視覺區域，請結合 [渲染與 OCR](./rendering-and-ocr.md) 使用 `--visual-regions` 或 `--render-visual-regions`。

## 範例：可稽核的 claim check

```bash
pdfvision annual-report.pdf --search "Net sales" --search "Operating income" --matches-only --json
```

An agent can inspect top-level `matches[]`, choose the hit with the right page, source, and context, then pass its `region` to the crop command. No `--layout` flag is needed because compact search computes the region internally. If that selected hit reports the following illustrative page and region, the follow-up is:

```bash
pdfvision annual-report.pdf --pages 42 --render --render-region 72,180,468,180 --render-output ./evidence --json
```

最終答案可以同時引用擷取文字和渲染後的證據區域。

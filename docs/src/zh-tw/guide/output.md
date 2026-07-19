---
title: 輸出格式
description: 選擇 pdfvision 的 Markdown、JSON、XML 或 TOON 輸出。
---

# 輸出格式

pdfvision 可以用多種格式呈現同一份擷取證據，但各格式的序列化契約不同。

請根據輸出的讀者選擇格式：人類、LLM prompt、工具，或 token 受限的代理迴圈。底層 evidence 欄位相同，格式只改變證據的呈現方式。

## Markdown

```bash
pdfvision document.pdf
pdfvision document.pdf --format markdown
```

Markdown 是預設格式，適合直接交給聊天模型或人閱讀。它包含概覽表、每頁文字、警告，以及啟用渲染時的影像連結。它會刻意轉換或省略結構化欄位：不輸出 `rawText`，而 `--strip-repeated` 會從內文移除重複版面區塊。

當人類或 chat model 會直接讀取輸出時使用。它也適合作為第一遍，讓模型在對話中理解文件並產生下一組 pdfvision 命令。

## JSON

```bash
pdfvision document.pdf --format json
```

JSON 暴露完整的 `DocumentResult` schema，適合工具、代理、測試與下游自動化。

常用欄位包括：

- `pages[].layout`
- `pages[].warnings`
- `pages[].spans`
- `pages[].imageBoxes`
- `pages[].visualRegions`
- `pages[].ocr`
- `outline`, `attachments`, `layers`, `viewer`

當需要程式化分支時使用 JSON：選擇要 OCR 的頁面、把 search matches 轉成 render regions、把 warnings 與擷取結果一起保存，或把影像路徑傳給另一個工具。

## XML

```bash
pdfvision document.pdf --format xml
```

XML 是用於呈現的標籤形 near-parity projection，不是可逆的 `DocumentResult` 序列化。`page` 對應 `no`，`pageLabel` 對應 `label`，巢狀 `quality` 會展平為頁面屬性。頁面結果保留 rotation 屬性，overview rotation 目前會省略，空欄位的存在方式也可能不同。

`rawText` 變為同層 `<rawText>`，`repeated: true` 變為 `<block repeated="true">`，頂層 `xfa: true` 變為 `<document xfa="true">`。

XML 1.0 無法包含大多數 C0 控制字元、`U+FFFE` / `U+FFFF` 或未配對的 UTF-16 代理項。pdfvision 會將每個禁止的程式碼單元表示為 `[[pdfvision:U+XXXX]]`，以維持 XML 格式正確。原文中的 `[[pdfvision:` 前綴會輸出為 `[[pdfvision:literal:`，因此一般文字不會與產生的標記衝突。需要原始程式碼單元時，請在解析 XML 後由左至右掃描一次：還原 literal-prefix 逸出且不要再次掃描已還原的前綴，並只解碼產生的程式碼單元標記。

當使用方或提示詞按照明確的 `<page>`、`<text>`、`<warning>`、match 和 layout block 邊界建立時使用 XML。

## TOON

```bash
pdfvision document.pdf --format toon
```

每個成功輸出的 TOON 在解碼後都與 JSON 資料模型完全一致，未設定的 `undefined` 欄位保持不存在。TOON 的字串語法無法讓未配對的 UTF-16 代理項無損通過 UTF-8 邊界，因此 pdfvision 會拒絕此邊界情況並提示使用 JSON，而不會默默替換字元。有效的代理項配對和字面值 `\uD800` 文字不受影響。具有相同純量欄位的物件陣列可以使用只宣告一次欄位名稱的表格形式。

包含巢狀值的陣列，以及項目之間欄位不同的陣列，仍使用列表形式。

當符合條件的均一陣列在結果中佔多數時，可以考慮 TOON。在注重 token 的工作流程中採用之前，請使用自己的文件和目標模型上下文比較各種格式。

## 實用預設值

- 快速的人類可讀擷取使用 Markdown。
- 工具和代理控制器使用 JSON。
- 受益於明確標籤的 prompt workflow 使用 XML。
- 當具有相同純量欄位的物件陣列佔多數時考慮 TOON，並使用自己的文件與 JSON 比較。

為了 debugging 和可重現性，優先使用 JSON。直接給模型閱讀時，請使用自己的文件和目標模型上下文比較各種格式。

---
title: "搜尋與區域放大"
description: "SearchMatch 的形狀，以及 --search 的每一種語意：字面（literal）比對與 regex 比對的差異、正規化（normalization）、會搜尋哪些來源，以及先搜尋再放大的流程。當執行 --search 或需要解讀其匹配結果時使用。"
sourceHash: ad23953812df
---

<!-- Translated from docs/src/en/guide/search-and-region-zoom.md, which is generated from docs/cli-topics/search.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# 搜尋輸出

供 `-f json`、`-f xml` 與 `-f toon` 使用者參考。

## 搜尋（`--search`）

```ts
interface SearchMatch {
  page: number;                // 1-based, mirrors PageResult.page
  query: string;               // verbatim source query
  queryIndex?: number;         // 0-based into the search array; omitted for single-query calls
  bbox: { x, y, width, height }; // union bbox of contributing spans/words/widgets/links/annotations
  boxes: { x, y, width, height }[]; // per-span/word/widget/link/annotation bboxes
  text: string;                // matched substring in the same form as pages[].text
  source: 'native' | 'formField' | 'link' | 'annotation' | 'ocr'; // native/span, formField/widget, link target, annotation, or OCR
  context?: string;            // surrounding line text for human / LLM readability
}
```

只有在傳入 `--search` 時才會輸出。每一次輸出的查詢命中都會成為一筆匹配——第 5 頁若輸出三次 `"foo"` 的命中，就會產生三筆 `page: 5` 的項目。每一個頁面、查詢與來源組合，最多輸出 10,000 筆匹配。超過上限後的第一筆額外有效匹配會產生一則警告（CLI 上輸出到 stderr，函式庫 API 則透過 `onWarning`）；這一筆與之後屬於同一組合的匹配都會被捨棄。

**單一流程的先搜尋、後放大**：pdfvision 輸出的每一個 box 都已經是 `--render-region` 所用的座標系統，不需要另外轉換。優先使用 `--matches-only`，它的每個項目都附有一個現成可裁切的 `region`，該範圍已經擴展到包含命中內容的表格列或視覺行；`bbox` 只裁切匹配到的字符本身，在財務表格上這麼做只會顯示出列標籤，而看不到任何數值。`region` 只存在於 `--matches-only` 的報告中——在完整報告中，請在渲染前自行對 `bbox` 加上邊距（padding），做法與 pdfvision 內部相同：水平方向每側加上 `max(60, 0.6 × bbox.width)`，垂直方向加上 `max(12, 0.3 × bbox.height)`，單位為原始頁面檢視座標，並限制在頁面範圍內（`--render-region` 對超出邊界的矩形會直接拒絕，而不是自動裁切）。代理的處理流程如下：

```bash
pdfvision doc.pdf --search "revenue" --json
# pick a match m from pages[N].matches[*]
pdfvision doc.pdf -p <m.page> --render --render-region <m.bbox.x>,<m.bbox.y>,<m.bbox.width>,<m.bbox.height>
```

`--matches-only` 讓扁平化的報告保持精簡，但仍會以選用的中繼資料保留非預設的實際縮放比例：JSON/TOON 中是 `pageUserUnits: [{ page, userUnit }]`，XML 中是對應的 `<pageUserUnits>` 項目，Markdown 中則是 `Page UserUnits` 摘要。當所選頁面全部使用 UserUnit 1 時，此欄位會省略。每一筆匹配都同時帶有 `bbox`（緊貼匹配字符的原始頁面檢視 box）與 `region`（已擴展到包含所在表格列、或在頁面沒有偵測到表格時擴展到視覺行的可裁切 box）。XML 把這一對值呈現在 `<match>` 上的 `x`/`y`/`width`/`height` 加上 `regionX`/`regionY`/`regionWidth`/`regionHeight`。兩者都是原始頁面檢視數值，可直接原封不動傳給 `--render-region`。請傳入 `region`：如果傳入 `bbox`，裁切結果只會有匹配到的字符本身，在財務表格上只會顯示列標籤而看不到任何數值。

**語意**：

- **預設採字面子字串（literal substring）比對**（查詢字串中的 regex 特殊字元會被跳脫）。傳入 `--search-regex` 可改用 JavaScript 正規表示式。
- **預設不區分大小寫**（以提高召回率為導向）。傳入 `--search-case-sensitive` 可改為精確比對大小寫。
- 當 `--normalize` 開啟（預設值）時，**字面模式下具備 NFKC 正規化感知並清理 C0 控制字元**——`"fi"` 可以找到外部 grep 會漏掉的 `"ﬁ"`（U+FB01 連字）PDF，全形拉丁字母／CJK 相容字形也會做同樣的折疊處理，並套用與 `pages[].text` 相同的不可見 C0 控制字元清理。
- **字面模式下具備 CJK 顯示間距感知**——查詢字串中相鄰的 CJK 字元，可以匹配 PDF 文字串流中因標題排版而產生的視覺間距，因此 `科学` 可以找到 `科 学`，同時仍會把較寬的欄間留白視為搜尋斷行點。
- **緊湊的表格標頭列可以整列當作片語搜尋**——像 `"Advance Estimate Second Estimate Third Estimate"` 這種相鄰的簡短欄位標籤，仍可以整列一起搜尋到，而較寬的一般文字欄位則維持分隔。
- **Regex 查詢不會被正規化**——NFKC 正規化可能把相容標點符號轉成 regex 的中繼字元（造成無聲的過度匹配或語法錯誤）。使用 regex 的人，查詢時輸入的是逐字碼點，比對的對象則是已正規化的文件文字，這種不對稱之處需要自行留意。
- **多重查詢**可透過重複傳入 `--search`（或函式庫中的 `search: string[]`）達成。每一筆匹配都帶有 `queryIndex`，讓代理可以區分是哪一個查詢產生的結果。
- **原生文字搜尋是在重建後的視覺行層級上進行的**。查詢可以跨越同一行中 pdf.js 的 span／字型執行（font-run）邊界（例如 `"Hello World"` 被拆成 `Hello` 與 `World`），並會回傳一個聯集 `bbox` 加上逐 span 的 `boxes[]`；但較窄的水平欄間留白會被視為斷行點，因此匹配不會把一個水平欄的結尾接到另一個欄的開頭。偵測到的 CJK 直式本文欄，會依由上到下、由右到左的閱讀順序搜尋；被排除在 `pages[].text` 與版面之外的半形振假名／注音（furigana/ruby）欄，同樣也會被排除在原生搜尋行之外。只有在原始串流本身已依照該順序排列時，`pages[].text` 才會把相同的欄連接起來。跨行片語的拼接目前刻意不予處理，因為產生的區域通常會過於寬廣，不適合視覺放大。
- **部分原生 span 匹配會在 span 的 bbox 內被切片**：水平 span 沿 x 軸切片，較高的垂直／旋轉 span 則沿 y 軸切片，讓 `--render-region` 可以放大到匹配的單字，而不是整行。
- **文字／選項表單欄位的值也會被搜尋**。表單欄位的匹配會以 `source: 'formField'` 回傳，並使用該 widget 的 bbox，即使輸出時沒有要求 `--form-fields` 也一樣；當 pdf.js 提供 `maxLen`／comb 外觀中繼資料時，comb（等寬格）文字 widget 的匹配會縮小到符合的儲存格。選項欄位在可見顯示值與匯出值不同時，會搜尋所選項目的可見顯示值。不是可見文字的內部值，例如未勾選核取方塊的 `Off`，或隱藏／noView 的 widget 值，不會被搜尋。
- **連結目標也會被搜尋**。連結的匹配會以 `source: 'link'` 回傳，並使用可點擊連結的 bbox，即使輸出時沒有要求 `--links` 也一樣。這讓即使可見的連結文字有字符亂碼問題，URL／目的地／附件目標的搜尋仍能成功。
- **可見的 FreeText 註解內容也會被搜尋**。註解的匹配會以 `source: 'annotation'` 回傳，並使用該註解的 bbox，即使輸出時沒有要求 `--annotations` 也一樣。便利貼彈出內容以及其他預設關閉的註解意見不會被搜尋。
- **開啟 `--ocr` 時，OCR 文字也會被搜尋**。來自 OCR 的匹配會以 `source: 'ocr'` 回傳；當 `ocr.words[]` 存在時，`bbox`／`boxes[]` 會使用與原生 span 相同座標系統的 OCR 單字幾何資訊。如果單字層級的重建漏掉了一次或多次命中，pdfvision 會從完整的 `ocr.text` 補充，並附上頁面層級的 bbox，讓無空格文字系統與 OCR 行邊界的差異仍然可搜尋。如果原生文字、表單欄位值或可見註解文字已在該頁產生了相同的查詢／文字命中，重複的 OCR 命中會被抑制，讓精確的非 OCR bbox 勝出；純 OCR 才有的額外命中仍會輸出。

當 `--search` 已執行但該頁沒有命中時，`pages[].matches` 會是**存在但為空陣列（`[]`）**——這與欄位完全不存在（代表未要求搜尋）不同。這個原則同樣延伸到 overview，它會多出一個 `matchCount` 鏡射欄位，同樣採用「存在但為 `0`」的語意。

---
title: "結構化輸出"
description: "頂層的 DocumentResult、逐頁的 PageOverview 與 PageResult 欄位、PageQuality，以及每個 bbox 所使用的座標系統。在以程式化方式使用 -f json / -f toon / processDocument() 輸出時參考。"
sourceHash: c44996363b15
---

<!-- Translated from docs/src/en/guide/structured-output.md, which is generated from docs/cli-topics/schema.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# 結構化輸出 schema

給 `-f json`、`-f xml` 與 `-f toon` 使用者的參考文件。當代理或工具需要以程式化方式取用結構化 payload，並需要知道每個欄位、其形狀與座標慣例時，請閱讀本篇。

以下 JSON 風格的欄位路徑，對 `-f json`、解碼後的 `-f toon` 與 `processDocument()` 而言是精確的。`-f xml` 是一種展示層投影，會重新命名並攤平其中一部分欄位（`page` → `no`、`pageLabel` → `label`、`quality.*` → 頁面屬性），其空欄位的呈現方式也可能不同；`-f markdown` 則會刻意轉換或省略部分欄位。各格式的具體約定請見 [`pdfvision docs formats`](./output.md)，匯出的 TypeScript 型別名稱則列在 [`pdfvision docs library`](./library-api.md)。

當 pdf.js 要求文件密碼時，加密 PDF 需要 `--password <value>`、`--password-stdin` 或 `processDocument(..., { password })`。密碼僅用於解密，絕不會出現在 JSON/XML/TOON/Markdown 輸出中。在意 argv 或 shell 歷史紀錄外洩風險的 CLI 工作流程中，建議優先使用 `--password-stdin`；當 stdin 為空時，可用 `--password` 作為明確的後備選項。

## DocumentResult（頂層）

```ts
interface DocumentResult {
  file: string;                // path/URL the CLI was invoked with
  totalPages: number;          // total in the source PDF, not in the selection
  metadata: DocumentMetadata;  // title / author / subject / creator (all string | null)
  pageLabels?: string[];       // full 0-indexed viewer page-label array; present iff --page-labels
  attachments?: DocumentAttachment[]; // embedded file metadata; present iff --attachments
  attachmentCount?: number;    // document-level embedded files; always computed, omitted when zero
  javascriptActionCount?: number; // document-level JavaScript scripts; always computed, omitted when zero
  outlineCount?: number;       // top-level outline entries; always computed, omitted when zero
  xfa?: boolean;               // true iff the PDF declares an XFA (LiveCycle) form; see xfa_form warning
  outline?: DocumentOutlineItem[]; // document bookmarks; present iff --outline
  viewer?: DocumentViewerState; // viewer settings; present iff --viewer
  layers?: DocumentLayers;       // optional content groups; present iff --layers
  overview?: PageOverview[];   // per-page density summary; present iff pages.length > 1
  pages: PageResult[];         // one entry per selected page, in page-number order
}
```

`file` 會在快取命中時被修補為本次呼叫的路徑或 `--remote` URL，因此即使快取項目來自另一次觸及相同內容雜湊的呼叫，下游使用者看到的仍是有意義的輸入標籤。

`javascriptActionCount` 是一個常駐的存在訊號。它計算 pdf.js 在文件層級回傳的腳本項目數量，包括 JavaScript catalog 的 `OpenAction` 項目與具名 JavaScript 項目。傳入 `--viewer` 可在 `viewer.jsActions` 中揭露其名稱與腳本原始碼；pdfvision 只把這些腳本當作資料回報，不會執行它們。
## PageOverview（密度摘要）

```ts
interface PageOverview {
  page: number;
  pageLabel?: string;             // viewer-visible page label; present iff --page-labels and labels exist
  charCount: number;
  imageCount: number;             // raster image draws (XObject + inline + mask + image-bearing patterns), per drawn instance
  vectorCount: number;            // vector drawing ops (paths / shadings), e.g. form boxes, chart rules, slide shapes
  textCoverage: number;           // 0..1, fraction of page area covered by text glyph bboxes
  nonPrintableRatio: number;      // 0..1, pre-C0-strip NUL / control / noncharacter fraction
  nonPrintableCount: number;      // raw count — stays discriminable when the 3dp ratio rounds to 0
  renderContentRatio?: number;    // 0..1, fraction of pixels differing from the page's dominant background (present iff --render or --ocr)
  rotation?: number;               // clockwise page rotation in degrees; present only for rotated pages
  userUnit?: number;               // PDF /UserUnit; omitted when 1; physical points = raw page-view value * userUnit
  quality: PageQuality;           // derived classification — see below
  warningCount?: number;          // mirror of pages[N].warnings.length, omitted when no rule fired
  matchCount?: number;            // mirror of pages[N].matches.length; present-with-0 means "search ran, no hit"
  vectorBoxCount?: number;        // mirror of pages[N].vectorBoxes.length; present iff --vector-boxes
  visualRegionCount?: number;     // mirror of pages[N].visualRegions.length; present iff --visual-regions
  formFieldCount?: number;        // furniture presence count; automatic when non-zero, present-with-0 when the matching flag ran
  linkCount?: number;             // furniture presence count; automatic when non-zero, present-with-0 when the matching flag ran
  annotationCount?: number;       // furniture presence count; automatic when non-zero, present-with-0 when the matching flag ran
  structureNodeCount?: number;    // count of tagged-PDF structure nodes; present iff --structure
  width: number;                  // raw unrotated page-view units
  height: number;
}
```

`overview[]` 是偵測靜默失敗時第一個該檢查的地方。`quality` 欄位提供一次性的分類；下面的原始訊號讓代理可以自行組合訊號：
- `imageCount > 0 && textCoverage ≈ 0` → 影像化（image-flattened）頁面；文字流是空的。
- `imageCount > 0 || vectorCount > 0` 加上非常低的 `textCoverage` 與極小的 `charCount` → 可見頁面大多不在原生文字範圍內（常見情況是投影片/影像上只有一個頁碼）。對應到 `quality.nativeTextStatus === 'sparse_text_with_visual_content'`。
- 非常低的 `charCount` 加上密集的向量結構，即使 `textCoverage` 不低，也可能對應到 `sparse_text_with_visual_content`，因為一個大型浮水印文字項目就可能覆蓋頁面大部分區域，而可見的表單/表格/圖表內容其實是以向量呈現的。
- 有原生文字但 `quality.visualStatus === 'blank'` → 原生文字在渲染後的頁面上不可見。常見情況：隱藏的 OCR 殘留、不可見/字型損壞的文字，或渲染層與文字層不一致。對應到 `quality.nativeTextStatus === 'sparse_text_on_blank_visual'`。
- `vectorCount > 0 && textCoverage is low`（文字覆蓋率低） → 即使 `imageCount` 為零，仍存在可見的非點陣結構；表單、圖表、示意圖與投影片形狀可能需要 `--render`。
- `0.05 <= nonPrintableRatio < 0.3` → 一個或多個字型缺少可用的 ToUnicode CMap；原生文字中可讀片段與原始字形索引混雜在一起。即使部分文字看起來可用，原生文字仍不完整。對應到 `quality.nativeTextStatus === 'mixed_glyph_indices'`。
- `nonPrintableRatio >= 0.3` → 頁面大部分缺少 ToUnicode CMap；即使 `textCoverage` 看起來正常，文字流大多是原始字形索引（NUL 加控制字元）。原生文字無法使用；請改用 `--render` 或 `--ocr`。對應到 `quality.nativeTextStatus === 'unusable_glyph_indices'`。
- 正規化後的 `pages[].text` 會移除不可見的 C0 控制字元（tab / 換行 / 歸位字元除外），但 `nonPrintableRatio` 與 `nonPrintableCount` 仍使用移除前的文字訊號，因此稀疏的控制位元組證據依然可見。
- Private Use Area（私有使用區）字形碼字串刻意不計入 `nonPrintableRatio`；圖示字型可以合法使用 PUA。當頁面文字以 PUA 為主時，即使 `quality.nativeTextStatus === 'ok'` 且 `nonPrintableRatio === 0`，`pages[].warnings[].code === 'glyph_garbage_text'` 仍會觸發。當重複的 PUA 字形出現在原本可讀的文字之中時，會觸發 `localized_glyph_noise`，以便對照渲染圖檢查公式或自訂符號序列。
- `quality.visualStatus === 'sparse'` → 渲染後的頁面並非空白，但可見標記稀疏。涵蓋 `0.001 < renderContentRatio <= 0.005`、低於空白閾值的微量已佐證影像/向量/註解痕跡，以及在空白閾值以下但仍有非零可見墨跡的純文字或純註解頁面；在判定為渲染失敗之前，請先檢查幾何資訊或渲染裁切圖確認。
- `quality.visualStatus === 'blank'` → 渲染後的頁面相對於自身主要背景實質上是空白的（僅在 `--render` 或 `--ocr` 開啟時才有意義）。此判定會考量背景色，因此深色封面與米色掃描件不會被誤判。可用來抓出 pdfvision 原本無法揭露的渲染管線失敗：pdf.js + @napi-rs/canvas 無法解碼 JPEG2000 影像流（在 Internet Archive 掃描件中常見），以及字型沒有可解析字形的 PDF 什麼都畫不出來。當 OCR 針對此情況執行時，`confidence: 0` *並非* OCR 失誤——而是輸入本身就是近乎單一色調的影像。
## PageResult（每頁）

```ts
interface PageResult {
  page: number;
  pageLabel?: string;           // viewer-visible label such as i, ii, A-1, 1; present iff --page-labels and labels exist
  text: string;                  // NFKC-normalized and C0-cleaned unless --no-normalize
  rawText?: string;              // pre-normalization text — present when normalization changed it
  charCount: number;
  imageCount: number;
  vectorCount: number;
  textCoverage: number;
  nonPrintableRatio: number;     // pre-C0-strip NUL / control / noncharacter ratio
  nonPrintableCount: number;     // pre-C0-strip raw count alongside the ratio
  renderContentRatio?: number;   // pixel fraction differing from the page's dominant background (present iff --render or --ocr)
  quality: PageQuality;          // derived per-page classification — agent-side dispatch lives on this field
  rotation?: number;              // clockwise page rotation in degrees; present only for rotated pages
  userUnit?: number;              // PDF /UserUnit; omitted when 1; mirrored in overview[]
  width: number;
  height: number;
  image?: string;                // absolute PNG path — present iff --render
  renderRegion?: { x, y, width, height }; // echoed back when --render-region was set; lets consumers tell crop vs full
  spans?: TextSpan[];            // present iff --geometry
  layout?: PageLayout;           // present iff --layout
  imageBoxes?: ImageBox[];       // present iff --image-boxes
  vectorBoxes?: VectorBox[];     // present iff --vector-boxes
  visualRegions?: VisualRegion[]; // present iff --visual-regions
  formFieldCount?: number;       // always computed; omitted when zero
  formFields?: FormField[];      // present iff --form-fields
  linkCount?: number;            // always computed; omitted when zero
  links?: PageLink[];            // present iff --links
  annotationCount?: number;      // always computed; omitted when zero
  annotations?: PageAnnotation[]; // present iff --annotations
  structure?: PageStructureNode | null; // present iff --structure; null means no page structure tree
  structureTables?: PageStructureTable[]; // tagged tables; present iff --structure found Table nodes
  jsActions?: Record<string, string[]>; // page-level JavaScript actions, present iff --viewer and the page defines them
  ocr?: PageOcr;                 // present iff --ocr
  warnings?: PageWarning[];      // omitted when no rule fired on the page
  matches?: SearchMatch[];       // present iff --search; empty array means "search ran, no hit on this page"
}

interface PageQuality {
  nativeTextStatus:
    | 'ok'                       // usable native text that is not sparse relative to non-text visuals
    | 'mixed_glyph_indices'      // 0.05 <= nonPrintableRatio < 0.3 — readable fragments mixed with glyph garbage
    | 'unusable_glyph_indices'   // nonPrintableRatio >= 0.3 — fall back to --ocr / --render
    | 'sparse_text_on_blank_visual' // native text exists but the rendered page is effectively blank
    | 'sparse_text_with_visual_content' // native text exists but is too sparse for a visual page
    | 'empty_but_visual_content' // no native text but the page has images / vectors / non-blank pixels / visible annotations not contradicted by a blank render
    | 'empty';                   // no text, no detected visual content
  visualStatus?:                 // present iff --render or --ocr triggered a raster
    | 'ok'                       // renderContentRatio > 0.005 — renderer drew clearly populated content
    | 'sparse'                   // sparse marks: 0.001 < ratio <= 0.005, or corroborated tiny visual traces
    | 'blank';                   // effectively blank against the page's own background
}
```

`text` 是 pdfjs 衍生出的文字流。原始文字項目會在正規化之前依 [`pdfvision docs layout`](./layout.md) 中的約定去除重複，因此選用內容（optional-content）與 overprint 造成的重複不會被讀成重複的詞。偵測到的正文大小日文直排欄，若其偵測到的由上而下欄序與來源流順序相符，就會依來源流順序拼接；若某一段順序不一致，只有該段會退回使用原始項目拼接。日文直排欄中的行內縱中橫（tatechuyoko）數字群組，例如 `10`，在來源流順序與幾何位置相符時會保留在欄文字中。在日文與中文的標音（annotated-reading）頁面上，當 pdfvision 能將較小的假名或拼音形狀的文字串，明確對應到一段不含歧義的中日文（CJK）基底範圍時，會以 `base《ruby》` 的形式將注音/振り仮名（furigana/ruby）附加在行內，這包括相鄰的半形直排 ruby 欄、位於橫排基底文字上方的較小假名，以及位於橫排中日文基底文字上方、拼音形狀的拉丁文注音；有歧義或無法對應的 ruby 會被排除在外，且搜尋同時使用包含 ruby 與去除 ruby 的兩種行文字，因此以基底詞查詢仍能命中。直排正文欄右側邊欄中，較短的中等大小附註參照標記也會被排除在重建後的文字/版面之外；`--geometry` 仍會揭露其保留的原始文字項目 span。若存在 `rawText`，在 JSON 與成功的 TOON 輸出中會是精確對應的相鄰欄位，在 XML 中會是相鄰的 `<rawText>` 元素（XML 禁止的碼位以文件所述的標記表示），在 Markdown 中則會省略。`ocr.text`（當 `--ocr` 開啟時）是伴隨的 OCR 結果，**絕不會覆寫 `text`**——使用者可自行比較兩者，或挑選該頁看起來較好的訊號。

`quality` 純粹是觀察結果，而非建議：pdfvision 只告訴代理它看到了什麼，接下來該怎麼做由代理自行決定。

功能性 payload 是選用的（opt-in），因此 `--layout --form-fields` 產生的結果，其形狀會與未傳入這些旗標時不同；只有上面列出的「附屬元素存在計數」（furniture presence count）會自動出現。一個已執行但什麼都沒找到的旗標，仍會輸出其欄位：`--form-fields`、`--links`、`--annotations` 與 `--search` 在沒有項目的頁面上會產生 `[]`，`--structure` 則會產生 `null`，讓使用者可以分辨「沒有要求」與「要求了但沒有結果」的差異。

## 座標系統

所有座標（spans、layout blocks、image boxes、vector boxes、visual regions、form fields、`renderRegion`）都使用未旋轉的 pdf.js `page.view` 可視框（visible box）的原始單位，`(0, 0)` 位於左上角，`y` 向下增長。當有一個有效且不同於預設值的 CropBox 時，這個框是 CropBox ∩ MediaBox，否則就是 MediaBox。`pages[].userUnit` 與 `overview[].userUnit` 會揭露非預設的 PDF `/UserUnit`，當其值為 1 時會省略。實體點數 = 原始頁面視框數值 × UserUnit；渲染像素 = 原始區域 × UserUnit × 渲染倍率，在旋轉交換座標軸之前計算。`pages[].width` / `height` 與 `renderRegion` 的邊界，是相對於可視框的原始數值，同一個 bbox 可以原封不動傳給 `--render-region`。JSON、解碼後的 TOON 與函式庫，都會在 `pages[].rotation` 與 `overview[].rotation` 中保留順時針旋轉角度；XML 會在 `<pages><page rotation="...">` 上保留頁面層級的旋轉角度，但目前會省略 overview 的旋轉角度。

警告偵測器的閾值與 `pt` / `pt²` 訊息，使用的是已擷取幾何資訊的內部實體點視圖，而公開的 bbox 仍維持原始單位。這並不代表整條擷取流程在實體上是不變的：版面分組、表單標籤重建、vector-box 的形狀判定，以及 visual-region 的產生，仍然包含原始單位的啟發式判斷，對於實體上等價但 UserUnit 非預設值的 PDF，可能產生不同的上游訊號。

要把未旋轉的頁面座標對應到未旋轉的整頁 PNG：

```ts
const sx = image.width / page.width;
const sy = image.height / page.height;
const pixelBox = { x: box.x * sx, y: box.y * sy, width: box.width * sx, height: box.height * sy };
```

這個直接縮放對未旋轉的頁面有效。對於旋轉過的頁面，請改用 `pages[].rotation` 與 PDF 的 viewport transform（或 `--render-region`），因為整頁 PNG 的寬/高，相對於 `page.width` / `page.height` 可能已經互換。

每一個帶有座標的欄位——spans、layout blocks 與 lines、image boxes、vector boxes、visual regions、form fields、連結與註解的 box、structure node 的 bbox、OCR 單字、搜尋 matches——都使用同一套座標系統，因此從結構化欄位轉換到視覺裁切圖，從不需要另外發明一套系統。

## 依任務查詢欄位

哪些欄位回答哪個問題，以及完整說明它們的主題：

- 文字閱讀 — `pages[].text`、`rawText`、`quality`、`warnings[]`（[`pdfvision docs warnings`](./warnings.md)）。
- 對版面敏感的閱讀 — `layout.blocks[]`、`layout.blocks[].lines[]`、`layout.tables[]`、`spans[]`（[`pdfvision docs layout`](./layout.md)）。
- 視覺檢查 — `image`、`renderContentRatio`、`imageBoxes[]`、`vectorBoxes[]`、`visualRegions[]`（[`pdfvision docs visual`](./visual.md)）。
- 掃描件復原 — `ocr.text`、`ocr.confidence`、`ocr.words`、`quality.visualStatus`（[`pdfvision docs ocr`](./ocr.md)）。
- 證據搜尋 — `matches[].source`、`matches[].bbox`、`matches[].context`（[`pdfvision docs search`](./search-and-region-zoom.md)）。
- 表單分析 — `formFields[]`：`value`、`checked`、`flags`、`actions`、`label`，以及 widget 的 bbox（[`pdfvision docs interactive`](./interactive.md)）。
- 導覽與文件功能 — `pageLabels`、`outline`、`links[]`、`viewer`、`layers`、`structure`（[`pdfvision docs document-features`](./document-features.md)）。
- 附件清單 — `attachments[]` 的中繼資料，以及 `--attachment-output` 寫出檔案位元組後的 `attachments[].path`（[`pdfvision docs document-features`](./document-features.md)）。

當一個結論仰賴上述某個欄位時，請保留該頁碼與產生此結論的 bbox；後續 `--render-region` 裁切要顯示該證據，需要的正是這一組配對。

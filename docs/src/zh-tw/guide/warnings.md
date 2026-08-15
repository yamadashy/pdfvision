---
title: "警告"
description: "說明每個 `pages[].warnings[]` 代碼、觸發條件、對文字的含義，以及影響 `quality` 判定的原始逐頁密度訊號。當警告需要比其內嵌訊息更多說明時使用本頁。"
sourceHash: 0a398b138f64
---

<!-- Translated from docs/src/en/guide/warnings.md, which is generated from docs/cli-topics/warnings.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# 警告與原始密度訊號參考

`pages[].warnings[]` 記錄了值得視覺檢查的頁面異常，而密度 Overview 則記錄了餵給 `quality` 的原始逐頁訊號。這裡的 JSON 風格路徑對 JSON、解碼後的 TOON 與 `processDocument()` 完全準確；XML 則使用 [`pdfvision docs formats`](./output.md) 中的對應規則。[`pdfvision docs schema`](./structured-output.md) 提供 `quality.nativeTextStatus` / `quality.visualStatus` 欄位摘要；本主題則是**每個原始訊號代表什麼**與**特定警告代碼觸發時該怎麼做**的查詢輔助頁面，補充內嵌 `warning.message` 已經自我說明之外的內容。

只有在 `warnings[]` 代碼需要超出其內嵌訊息的解讀，或你想了解 `quality` 狀態背後的原始訊號門檻時，才需要閱讀本頁。

這份資料機器可讀的一面——`PageWarning` TypeScript 介面（`code` union、`severity`、`message`、`blockIndex` / `otherBlockIndex` / `imageBoxIndex`）、確切的觸發條件，以及各代碼所需的 flag——就在下面的「結構」小節。

pdfvision 刻意止步於觀察：它**不會**建議該採取什麼行動。行動由代理根據兩個 `quality` 狀態加上以下原始訊號自行判斷。靜默失敗——例如對下游消費者看起來沒問題的空 `text`，或實際上全是 NUL bytes 的「完整」`text`——會提前變得可見；這正是選擇 pdfvision 而非直接讀取 PDF 的原因。

## 結構

```ts
interface PageWarning {
  code:
    | 'text_overlap'
    | 'near_bottom_edge'
    | 'body_near_repeated_chrome'
    | 'page_edge_text_truncated'
    | 'off_page'
    | 'glyph_garbage_text'
    | 'rtl_script_text'
    | 'localized_glyph_noise'
    | 'font_mapping_warning'
    | 'raw_embedded_source_text'
    | 'invisible_text'
    | 'text_under_opaque_fill'
    | 'dense_vector_graphics'
    | 'vector_graphics_no_native_text'
    | 'duplicate_text_layer'
    | 'raster_image_no_native_text'
    | 'tabular_numeric_layout'
    | 'dot_leader_noise'
    | 'tiny_native_text_noise'
    | 'raster_backed_text_layer'
    | 'raster_text_layer_symbol_noise'
    | 'raster_text_layer_word_fragmentation'
    | 'ocr_low_confidence'
    | 'ocr_native_text_mismatch'
    | 'ocr_native_spacing_loss'
    | 'large_raster_low_text_overlap'
    | 'annotation_text_missing_from_native'
    | 'optional_content_text_may_include_hidden_layers'
    | 'reading_order_divergence'
    | 'xfa_form';
  severity: 'warning' | 'error';
  message: string;
  blockIndex?: number;        // 0-based into pages[N].layout.blocks
  otherBlockIndex?: number;   // for pair-wise rules (text_overlap, body_near_repeated_chrome)
  imageBoxIndex?: number;     // 0-based into pages[N].imageBoxes for image-region rules
}
```

當沒有規則觸發時，`pages[].warnings[]` 會被省略。幾何類警告需要 `--layout`，因為它們會定位到版面區塊，並且在字形嚴重損壞、原生 bbox 不可信的頁面上會被抑制。影像區域警告即使未要求 `--image-boxes`，也可以使用 pdfvision 內部的影像框偵測流程；只有在公開的 `pages[].imageBoxes` 存在時才會輸出 `imageBoxIndex`。當 `--image-boxes` 與 `--layout` 或 `--geometry` 搭配使用時，`large_raster_low_text_overlap` 能取得更強的重疊證據，因為它可以把影像框與原生文字 bbox 做比對。在 `raster_image_no_native_text` 已經觸發的空原生文字頁面上，不會輸出此警告。`tabular_numeric_layout` 需要 `--layout`，因為它要檢查對齊的版面行。`tiny_native_text_noise` 需要 `--layout` 或 `--geometry`，因為它要檢查字型大小幾何。`duplicate_text_layer` 使用內部 span，即使沒有 `--layout` 或 `--geometry` 也可能出現；它可能與 `off_page` 或 `text_overlap` 同時出現，因為那些是膨脹的原生層所產生的另外幾何症狀。`annotation_text_missing_from_native` 即使未要求 `--annotations`，也可以使用 pdfvision 內部的註解偵測流程；但公開的 `pages[].annotations` 仍然只在指定 `--annotations` 時才會輸出。`glyph_garbage_text`、`rtl_script_text`、`localized_glyph_noise`、`font_mapping_warning`、`raw_embedded_source_text`、`invisible_text`、`text_under_opaque_fill`、`dense_vector_graphics`、`vector_graphics_no_native_text`、`dot_leader_noise` 與 `optional_content_text_may_include_hidden_layers` 使用一律啟用的頁面/文件層級訊號，即使沒有版面資訊也可能出現。`invisible_text` 與 `text_under_opaque_fill` 重複使用已為影像/向量分析取得的頁面 operator 清單，並在以點陣圖為底的 OCR 文字層上被抑制；註解外觀 operator、複雜路徑幾何、透明、被裁切、有 soft mask、屬於 transparency group 或 optional-content 的填色，以及非 normal 混合模式的填色，都會被排除在不透明填色證據之外。`dense_vector_graphics` 也可以使用內部向量框幾何，抑制那些密集向量只是零星裝飾、以文字為主的頁面。`raster_backed_text_layer`、`raster_text_layer_symbol_noise`、`raster_text_layer_word_fragmentation` 與 `raster_image_no_native_text` 使用內部影像框偵測流程，即使沒有要求 `--image-boxes` 也可能出現。`ocr_low_confidence`、`ocr_native_text_mismatch` 與 `ocr_native_spacing_loss` 需要 `--ocr`。`xfa_form` 是附加在第一個被擷取頁面上、文件層級、一律啟用的訊號。

目前的規則目錄：

- `text_overlap` — 非重複的版面區塊發生重疊，可能打亂閱讀順序。行內數學式、跨行數學式註記、上標、下標、純標點符號的行內片段、地圖點狀/裝飾紋理區塊，以及標註記號延續行所造成的相鄰行淺層 bbox 誤差會被抑制。
- `near_bottom_edge` — 內文文字結束的位置異常地接近頁面底部。
- `body_near_repeated_chrome` — 內文文字與偵測到的重複頁首/頁尾裝飾重疊或幾乎相接。
- `page_edge_text_truncated` — 一段至少 8 個 code point、6em 長的擷取文字，沿其主要書寫軸抵達或超出頁面邊界至多 1.25em，符合 pdf.js 把頁面框外的後續字形捨棄時「最後保留字形」的特徵。自然的標點結尾會被抑制。此訊號透過內部 span 幾何一律啟用；當有版面資訊時會包含 `blockIndex`，且同一區塊的 `off_page` 判定會被此內容遺失警告取代而抑制。
- `off_page` — 版面區塊的 bbox 超出頁面範圍。
- `glyph_garbage_text` — `quality.nativeTextStatus` 為 `mixed_glyph_indices` 或 `unusable_glyph_indices`，或原生文字被 Private Use Area 字形代碼字串主導；原生文字有部分或大部分是原始字形索引亂碼，使用前應對照渲染圖/OCR 檢查。
- `rtl_script_text` — 頁面至少有 50 個 Unicode 字母，且超過 25% 落在希伯來文、阿拉伯文或相關的強右至左範圍內；邏輯順序會被保留，但字詞間的空格可能消失、成對的括號可能被鏡像，若精確用字很重要，請對照渲染圖檢查。
- `localized_glyph_noise` — 出現多個不可列印 code point，但未達到混合字形門檻；原本可用的原生文字中出現 Unicode 替代字元（`U+FFFD`）；私用區字形代碼在一小段文字中佔主導，或在原本可讀的文字中反覆出現；CJK 文字中出現孤立的 Latin-extended 亂碼；一段短文字被相鄰的 Latin-1 補充可列印亂碼主導；許多相鄰的 CJK 字形被疑似人工插入的空格分隔，或被重複為相鄰配對；或可列印的字型對映雜訊把大寫 `LJ` 插入原本全小寫的字詞中，例如 `veriLJcation`。常見於損壞的公式、比較符號、單位標記、項目符號、點狀引導線、非拉丁自訂字型、圖示字型符號、CJK 文字定位偽影、文字層重複，或連字/字型對映替代。
- `font_mapping_warning` — pdf.js 回報缺少或可疑的字型字元對映資料，而原生文字在其他方面看起來可用；可見文字可能正常渲染，但擷取結果卻是可列印字形替代字元，若精確文字很重要，請對照渲染圖檢查。
- `raw_embedded_source_text` — 較長的內嵌產生器/來源資料（例如 `<latexit...>` LaTeX 影像來源）洩漏進原生文字；在對照渲染圖/OCR 檢查之前，應將相符的 `pages[].text`、版面文字與搜尋結果視為機器殘留物。
- `invisible_text` — 有一個或多個文字繪製操作是在 PDF 文字渲染模式 `Tr 3` 生效時執行的。pdf.js 會揭露此模式變更與解碼後的字形 Unicode，記錄在頁面 operator 清單中，因此警告會在可取得資訊時附上簡短範例。文字仍會留在 `pages[].text` 中，但不會繪製給人類讀者看；在信任之前請對照 `--render` 檢查。當整頁點陣圖顯示為 OCR 文字層時（包含低於一般 `raster_backed_text_layer` 門檻的稀疏 OCR 殘留），此警告會被抑制。白色/與背景同色的文字不在偵測範圍內，因為僅憑 operator 填色加上粗略的影像/向量框，無法可靠判定每個字形底下的實際背景。
- `text_under_opaque_fill` — 一個或多個至少 3 個非空白字元的原生文字 span，被之後繪製的矩形路徑填色至少覆蓋 90% 面積，該填色的 alpha 在 0.9 到 1 之間、暗部亮度至多 0.2、混合模式為 normal，且沒有作用中的裁切、soft mask、transparency group 或 optional-content 框。警告會回報被覆蓋的文字段數與簡短範例。偵測方式是將標準化後的 span 從結尾對齊到依序排列的 operator-list 文字繪製記錄；一個 span 可能對應到相鄰記錄的精確確定性串接結果，只有在最後一次依序精確匹配之後繪製的填色才算數。這可避免把「相同前景文字在填色之後被重新繪製」的去重 span 誤判為隱藏文字。當頁面證據超過 4,096 個候選 span、文字記錄或候選填色；65,536 個 span、原始記錄或 NFKC 正規化後的 UTF-16 code unit；1,000,000 次記錄/code-unit 比對步驟；或 250,000 次 span/填色覆蓋檢查時，蒐集與比對會直接失敗（fail closed）。路徑資料本身必須證明是在保持軸向的 CTM 下、單一封閉的軸對齊矩形。複雜路徑（包含有孔洞與不連續子路徑者）、註解外觀 operator、筆畫、淺色/半透明/透明、被裁切、有 soft mask、屬於 transparency group 或 optional-content 的填色，非 normal 或無法解析的混合模式填色、底線/部分覆蓋、在前景文字之前繪製的填色、旋轉或傾斜的路徑框、無效幾何，以及無法解析的顏色，一律會被忽略。CTM、填色顏色/透明度、非筆畫 alpha、混合模式、裁切、soft mask 與 marked-content 狀態會透過 save/restore 與 Form XObject 追蹤。Form BBox 裁切會被視為作用中的裁切。此偵測在以點陣圖為底的 OCR 文字層上會被抑制。不需要 `--geometry`、`--vector-boxes` 或 `--annotations` flag，且此警告不會改變 `quality`。
- `dense_vector_graphics` — 頁面包含許多具意義的向量繪圖操作；常見於表單框線、表格線、圖表路徑、核取方塊或圖表，其可見結構未在原生文字中呈現。當向量框幾何資訊可用時，向量僅為零星裝飾、以文字為主的頁面會被抑制。
- `vector_graphics_no_native_text` — 一個非空白、只有向量內容的頁面沒有原生文字；符號、圖表或以路徑繪製的標籤可能在渲染圖中可見，但不存在於 `pages[].text` 中。
- `tabular_numeric_layout` — 許多短數字行形成多個共享列位置的對齊欄；常見於財務報表或密集數字表格，其行/欄關係在視覺上很明顯，但在純原生文字中會被攤平。圖表座標軸刻度標籤與不規則的圖表資料標籤列會被抑制。
- `dot_leader_noise` — 許多獨立的點狀引導線/雜訊行被擷取為獨立的版面文字；常見於目錄引導線、表格引導線、地圖點狀紋理，或用於視覺連接標籤或呈現紋理的裝飾性點狀圖案，但在純原生文字中可能會呈現為雜亂的點狀段落。
- `tiny_native_text_noise` — 一個或多個較長的原生文字段落被設定為極小的字型大小，常見於隱藏的產生器連結或機器可讀殘留物。在對照渲染圖檢查之前，應將相符的 `pages[].text`、連結與搜尋結果視為可能對人類不可見。需要 `--layout` 或 `--geometry`。
- `duplicate_text_layer` — 原生文字中包含一個隱藏的、以固定縮放/位移位置存在的可見內容近似重複層，導致 `pages[].text` 被膨脹，且版面區塊可能會合併重複的段落；若精確可見文字很重要，優先參考渲染圖或 OCR。它可能與 `off_page` 或 `text_overlap` 同時出現，這些仍是各自獨立的版面幾何訊號。
- `raster_backed_text_layer` — 原生文字看起來是覆蓋在整頁點陣影像上的 OCR/文字層，包含掃描封面上帶有少量裝飾性向量標記的稀疏 OCR 層；文字可能有用，但容易出錯，bbox/版面幾何也可能與人類看到的像素有落差。
- `raster_text_layer_symbol_noise` — 以點陣圖為底的原生文字層被可列印的標點/符號雜訊主導；常見於老舊掃描 OCR 標題頁，即使原生文字明顯不可靠，`quality.nativeTextStatus` 仍可能是 `ok`。
- `raster_text_layer_word_fragmentation` — 以點陣圖為底的原生文字層包含許多孤立的拉丁字母片段，這是常見的舊式 OCR 失敗模式，例如 `report` 被擷取成 `r e p o r t`；精確用字與原生搜尋漏找的情況，應對照 `--ocr` 或渲染圖檢查。
- `raster_image_no_native_text` — 點陣影像主導整個頁面，而原生文字為空，因此影像內人類可見的文字不會出現在 `pages[].text` 中；若精確文字很重要，請對照渲染圖或 OCR。在原生文字為空的頁面上，此警告會涵蓋 `large_raster_low_text_overlap`。
- `ocr_low_confidence` — `--ocr` 執行後信心分數低於 0.5，而原生擷取結果為空、稀疏、字形損壞，或依附於以點陣圖為底的文字層；OCR 文字雖然存在，但在對照渲染圖、語言選擇或聚焦裁切檢查之前，應視為暫定結果。
- `ocr_native_text_mismatch` — `--ocr` 執行後信心分數很高，且長度相近的短 OCR 文字與原本狀態為 ok 的原生文字明顯不一致；常見原因是自訂字型能正確渲染文字，但擷取結果卻是可列印字形替代字元。
- `ocr_native_spacing_loss` — `--ocr` 在以點陣圖為底的文字層上執行，信心分數很高，OCR 與原生文字包含相近的字元，但原生文字遺失了許多詞界；常見於掃描 OCR 層被擷取成黏在一起的單字，即使 OCR 能還原正常的空格。
- `large_raster_low_text_overlap` — 一張大型點陣影像主導一個原生文字為空或稀疏的頁面，或啟用 bbox 的擷取只找到很少重疊的原生文字，因此影像內的標籤、圖表文字、地圖文字或截圖文字都不會出現在原生文字中。在 `raster_image_no_native_text` 已經觸發的空原生文字頁面上，不會輸出此警告。
- `annotation_text_missing_from_native` — 一個或多個可見 FreeText 註解外觀的 `contents` 未反映在 `pages[].text` 中；在把原生文字視為完整之前，請閱讀 `pages[].annotations` 或使用 `--search` / `--render-region`。即使輸出時未指定 `--annotations`，此警告也可能出現。
- `optional_content_text_may_include_hidden_layers` — 頁面文字串流包含被標記為 optional-content 的文字，而該 PDF 至少有一個預設隱藏的圖層；`pages[].text` 可能包含檢視器初始渲染時不會顯示的圖層內容，請檢查 `--layers` 並對照 `--render`。
- `reading_order_divergence` — 視覺閱讀順序與 `pages[].text` 不一致。這在以下情況會觸發：帶頭的標題在 `layout.blocks` 中排在最前，卻只出現在原生文字串流的後半部；投影片式的視覺上排在最前的標題/頁首其實是最後繪製的，並出現在原生文字的末尾；靠後的頁底註記或右側邊欄出現在原生文字的開頭；同一區塊內重建的版面行以錯亂順序輸出；出現一個緊湊的類數學區塊，其字元順序被重排，例如上標在基線運算式之後才輸出；或是 `--form-fields` 揭露的表單標籤，其原生文字順序與可見的列順序不同。表單日期預留位置（例如 `MM / DD / YYYY`）會被抑制。當順序很重要時，優先採用 `layout.blocks` 的順序而非 `pages[].text`——在這些頁面上，Markdown 格式器本來就已經從版面區塊重建內文。需要 `--layout`；`blockIndex` 指向被移位的標題、投影片標題/頁首、靠後區塊、局部區塊或表單標籤區塊。
- `xfa_form` — 文件層級：該 PDF 宣告為 XFA（LiveCycle）表單；附加在第一個被擷取的頁面上。標準文字層可能只是檢視器的預留字串（「Please wait...」），真正的表單內容並未被擷取——請把預留字串視為尚未讀取的內容，而非文件本身。JSON/TOON/函式庫使用頂層的 `xfa: true`；XML 使用 `<document xfa="true">`。

與 `quality` 相同的觀察立場：pdfvision 只告訴代理它看到了什麼；由代理決定是否要呈報、重新 OCR，或透過 `--render-region` 放大檢視。

## 密度 Overview

當 `result.pages.length > 1` 時，Markdown 輸出會以一個 Overview 表格開頭：每頁的 `Chars / Images / Coverage / Size`，再加上 `Rotation`（當有任何頁面被旋轉時）、`Vectors`（任何有向量繪圖操作的頁面）、`NonPrint`（任何不可列印比例非零的頁面）、`Tables`（`--layout` 找到列優先的表格線索）與 `Blocks`（`--layout` 已啟用）。搭配 `--layout` 時，Markdown 也會把偵測到的 `layout.tables[]` 渲染成逐頁的 `Layout tables` 小節，讓財務報表等數字表格在適合聊天閱讀的輸出中，仍保留列/值的對應關係。

JSON、解碼後的 TOON 與 `processDocument()` 會把這些訊號放在 `overview[]` 中，欄位為 `charCount` / `imageCount` / `vectorCount` / `textCoverage` / `nonPrintableRatio` / `nonPrintableCount` / `rotation` / `width` / `height` / 巢狀的 `quality`。XML 使用 `<overview><page no="..." ...>` 屬性，把 `quality` 攤平成 `nativeTextStatus` / `visualStatus`，目前 overview 中省略了 rotation。在捲動內文之前，請先閱讀 Overview。

## 原始訊號（`quality` 的輸入資料）

- `textCoverage: 0`（在 markdown 中呈現為 `coverage: 0%`）+ `imageCount > 0` → 頁面內容是一張點陣化影像。文字串流為空。請加上 `--ocr` 或 `--render` 重新執行。
- 非常低的 `textCoverage`，加上 `imageCount > 0` / `vectorCount > 0`，且字元數很少 → 可見頁面內容大多不在原生文字之內（`quality.nativeTextStatus === 'sparse_text_with_visual_content'`）。在信任這段稀疏文字之前請先渲染。
- 非常低的 `charCount` 加上密集的向量結構，即使 `textCoverage` 不低，也可能對應到 `sparse_text_with_visual_content`，因為一個大型浮水印文字項目可以覆蓋頁面的大部分面積，而可見的表單/表格/圖表內容其實存在於向量中。
- 任何原生文字加上 `quality.visualStatus === 'blank'` → 原生文字在渲染後的頁面上不可見（`quality.nativeTextStatus === 'sparse_text_on_blank_visual'`）。常見於掃描書籍的前置頁面、隱藏/字型損壞的文字，以及渲染失敗的情況；不要把這段文字當成人類可見的頁面內容。
- `vectorCount > 0` 且文字覆蓋率偏低 → 即使 `imageCount` 為零，仍存在可見的非點陣結構（表單、圖表路徑、投影片形狀、圖表）。當視覺版面很重要時，請用 `--render` 檢查。
- `nonPrintableRatio >= 0.05` → pdf.js 因為部分字型缺少 ToUnicode CMap（常見於希伯來文、較舊的 CJK、自訂符號字型，以及有品牌設計的年報），改用原始字形索引回退，至少影響頁面的一部分。`0.05–0.3` 對應到 `quality.nativeTextStatus === 'mixed_glyph_indices'`：部分文字可能可讀，但原生擷取並不完整。`>= 0.3` 對應到 `unusable_glyph_indices`：應把原生文字視為大部分是亂碼。原始計數存放在 `nonPrintableCount` 中——當三位小數的比例四捨五入為 0 時，這個計數仍能告訴你這個頁面是否混入了任何不可列印的 code point（適用於「這頁有沒有任何亂碼？」的過濾條件）。標準化後的 `pages[].text` 會去除 tab / 換行 / 回車以外的不可見 C0 控制字元，但這些計數器仍使用去除前的文字訊號，因此稀疏的控制位元組證據仍然可見。
- `charCount: 0` 但 `imageCount: 0` → 真正的空白頁（分隔頁、結尾附錄等）。
- 在文字密集的文件中，單一頁面的 `textCoverage` 突然下降 → 該頁很可能是圖片/掃描件/圖表。請用 `--render` 檢查。
- `quality.visualStatus === 'sparse'` → 點陣化後的頁面不是空白，但可見的標記太小/太稀疏，不足以稱為視覺上有內容的頁面。這可能是單行純文字頁面，也可能是很小的影像/向量/註解標記。請用物件幾何資訊（`spans`、`vectorBoxes`、`imageBoxes`、`annotations`、`visualRegions`）或 `--render-region` 檢查該標記，而不要把這當成渲染失敗。
- `quality.visualStatus === 'blank'` → 點陣化後的頁面**相對於自身主導背景**呈現空白。可能是渲染管線失敗（pdf.js + @napi-rs/canvas 無法解碼 JPEG2000 影像串流，或字型沒有可解析的字形），也可能是真正的空白頁。這個比例會考量背景——深色書封與米色掃描紙不會誤觸發。這個頁面上的 OCR 回傳 `confidence: 0`，不是因為 OCR 失敗，而是因為輸入是近乎均勻的影像。

## 警告目錄（各代碼對應的代理行動）

各代碼所需的 flag 已標註在條目中。幾何類警告會定位到版面區塊，因此需要 `--layout`；有幾個文字品質與影像類警告依附在一律啟用或內部的偵測流程上，即使沒有對應的輸出 flag 也會出現。精確的觸發/抑制條件請見上方的「結構」小節。

- **`text_overlap`**（需要 `--layout`）— 非重複的版面區塊發生重疊，可能打亂閱讀順序。優先採用 `layout.blocks` 的順序；當順序很重要時，渲染該區域確認。
- **`near_bottom_edge`**（需要 `--layout`）— 內文文字結束的位置異常地接近頁面底部。
- **`body_near_repeated_chrome`**（需要 `--layout`）— 內文文字與偵測到的重複頁首/頁尾裝飾重疊或幾乎相接。
- **`page_edge_text_truncated`**（一律啟用的文字幾何訊號）— 一段較長的擷取文字沿其書寫軸抵達或略微超出頁面邊界，符合 pdf.js 在後續字形被捨棄於頁面框外時的特徵。原生文字可能不完整；請用 `--render` 或 `--render-region` 檢查頁面實際顯示的內容。在對齊邊緣的自然標點推進會被抑制。
- **`off_page`**（需要 `--layout`）— 版面區塊的 bbox 超出頁面範圍。
- **`glyph_garbage_text`**（一律啟用的文字品質訊號）— 當 `quality.nativeTextStatus` 為 `mixed_glyph_indices` 或 `unusable_glyph_indices`，或原生文字被 Private Use Area 字形代碼字串主導（即使 `nonPrintableRatio` 為 0）時觸發。請把原生 `text`、`spans`、搜尋結果與版面文字視為不完整或不可靠；用 `--render` 檢查，並考慮使用 `--ocr`。
- **`rtl_script_text`**（一律啟用的文字品質訊號）— 當頁面至少有 50 個 Unicode 字母，且超過 25% 落在希伯來文、阿拉伯文或相關的強右至左範圍時觸發。原生擷取仍維持邏輯順序，但字詞間的空格可能消失、成對的括號可能被鏡像；若精確用字很重要，請對照 `--render`。
- **`localized_glyph_noise`**（一律啟用的文字品質訊號）— 當出現多個不可列印 code point 但未達混合字形比例門檻、原生文字包含 Unicode 替代字元（`U+FFFD`）、私用區字形代碼在一小段文字中佔主導、CJK 頁面出現孤立的 Latin-extended 亂碼字元、文字被 Latin-1 補充可列印亂碼主導、許多相鄰的 CJK 字形被疑似人工插入的空格分隔或被重複為相鄰配對，或可列印的字型對映雜訊把大寫 `LJ` 插入原本全小寫的字詞（例如 `veriLJcation`）時觸發。常見情況：公式、比較符號、單位標記、項目符號、點狀引導線、非拉丁自訂字型、圖示字型、CJK 文字定位偽影、文字層重複，或連字/字型對映替代——這些在畫面上顯示正常，但擷取結果卻是控制字元、替代字形、人工插入的空格、重複的 CJK 字形，或雜散的可列印字形。
- **`font_mapping_warning`**（擷取自 pdf.js 的字型/CMap 警告）— 當原生文字在其他方面看起來是 `ok`，但 pdf.js 回報缺少字元對映資料時觸發。常見情況：自訂內嵌字型能正常顯示，但擷取結果卻是可列印字形替代字元；若精確文字很重要，請用 `--render` 檢查。
- **`raw_embedded_source_text`**（一律啟用的文字品質訊號）— 當較長的內嵌產生器/來源資料（例如 `<latexit...>` LaTeX 影像來源）洩漏進原生文字時觸發。在對照 `--render` 或 `--ocr` 檢查之前，應將相符的 `pages[].text`、版面文字與搜尋結果視為機器殘留物。
- **`invisible_text`**（一律啟用的 operator-list 訊號）— 頁面包含以 PDF 渲染模式 `Tr 3` 繪製的文字：它會被納入原生擷取，但人類讀者看不到。這是 error 等級的信任訊號；在對照 `--render` 之前，應將取樣的文字與相符的原生搜尋結果視為未經驗證。整頁點陣圖/OCR 文字層會被抑制，因為隱藏文字在那裡是預期會出現的，既有的掃描類警告已經說明了那個信任邊界，包括低於一般 `raster_backed_text_layer` 門檻的稀疏 OCR 殘留。與背景同色的文字（例如白色文字疊在白色背景上）刻意不做偵測：僅憑填色顏色無法可靠地區分隱藏內容，與疊在深色影像、向量面板或非白色頁面背景上的合法淺色文字。
- **`text_under_opaque_fill`**（一律啟用的 operator-list 訊號）— 即使有一個之後繪製的不透明深色矩形路徑填色覆蓋了至少 90% 的 span 面積，原生文字仍可被擷取。這是 error 等級的信任訊號，可能代表一次無效的僅視覺遮蓋（redaction）。偵測器要求以最多 16 個路徑數字編碼、確實為正的矩形路徑幾何；複雜路徑（包括帶孔洞的偶奇規則框）、註解外觀 operator、透明填色、作用中的裁切或 soft mask、屬於 transparency group 的填色、optional-content 填色，以及非 normal 混合模式的填色，均排除在外。相鄰的文字繪製記錄可能只透過確定性的依序串接才能對齊到一個擷取出的 span；當擷取過程對相同文字繪製做去重時，最後一次依序精確匹配會決定該填色是否真的在文字之後。當每頁超過 4,096 個候選 span、文字記錄或候選填色；65,536 個 span、原始記錄或 NFKC 正規化後的 UTF-16 code unit；共用預算 1,000,000 次記錄/code-unit 比對步驟；或 250,000 次 span/填色覆蓋檢查時，蒐集與對齊會直接失敗（fail closed）。在重複繪製或信任被覆蓋的文字之前，請把取樣結果與相符的原生搜尋結果視為已曝露的隱藏內容，並對照 `--render` 檢查。此偵測在以點陣圖為底的 OCR 文字層上會被抑制。不需要 `--geometry`、`--vector-boxes` 或 `--annotations` flag。
- **`dense_vector_graphics`**（一律啟用的 `vectorCount` 訊號）— 在被具意義的向量繪圖操作主導的頁面上觸發。向量僅為零星裝飾、以文字為主的頁面會被抑制。常見觸發情況：表單、核取方塊、表格線、圖表路徑，以及可見結構未在原生文字中呈現的圖表。
- **`vector_graphics_no_native_text`**（一律啟用的 `vectorCount` 訊號）— 當一個非空白、只有向量內容的頁面沒有原生文字時觸發。常見情況：符號、圖表或以路徑繪製的標籤能正常顯示，卻不會出現在 `pages[].text` 中；請用 `--render`、`--vector-boxes` 或 `--visual-regions` 檢查。
- **`tabular_numeric_layout`**（需要 `--layout`）— 當許多短數字行形成多個共享列位置的對齊欄時觸發。常見情況：財務報表與密集數字表格，其行/欄關係在視覺上很明顯，但在純原生文字中會被攤平。當有標籤的列包含重複出現的數字欄時，不規則的財務表格仍可能被觸發；圖表座標軸刻度標籤與不規則的圖表資料標籤列會被抑制。
- **`dot_leader_noise`**（原生文字/版面訊號）— 當許多獨立的點狀引導線/雜訊行被擷取為獨立文字時觸發。常見情況：目錄引導線、表格引導線、地圖點狀紋理，以及用於視覺連接標籤或呈現紋理的裝飾性點狀圖案，在純原生文字中可能呈現為雜亂的點狀段落。
- **`tiny_native_text_noise`**（需要 `--layout` 或 `--geometry`）— 當較長的原生文字段落被設定為極小字型大小時觸發，例如隱藏的產生器連結。在對照 `--render` 檢查之前，應將相符的 `pages[].text`、連結與搜尋結果視為可能對人類不可見。
- **`duplicate_text_layer`**（內部 span；不需要 flag）— 當原生文字中包含一個以固定縮放/位移位置存在、隱藏的可見文字近似重複層時觸發。它可能與 `off_page` 或 `text_overlap` 同時出現，因為那些是各自獨立的幾何症狀；若精確可見文字很重要，優先參考渲染圖或 OCR。
- **`raster_backed_text_layer`**（內部影像框偵測流程；不需要 flag）— 原生文字看起來是覆蓋在整頁點陣掃描上的 OCR/文字層，包含掃描封面上帶有少量裝飾性向量標記的稀疏 OCR 層。請把文字視為可能有用但容易出錯：辨識結果可能有誤，精確的原生 `--search` 可能漏掉可見的字詞，`spans` / `layout.blocks` 也可能與人類看到的像素對不齊。當用字或搜尋召回率很重要時，請加上 `--ocr` 重新執行。
- **`raster_text_layer_symbol_noise`**（出現在以點陣圖為底的文字層上）— 原生文字被可列印的標點/符號雜訊主導（例如老舊掃描 OCR 標題頁充滿 `^`、`_` 與雜散標記）。即使 `quality.nativeTextStatus` 仍是 `ok`，也應將原生文字視為特別可疑。
- **`raster_text_layer_word_fragmentation`**（出現在以點陣圖為底的文字層上）— 許多拉丁單字被拆成孤立的字母片段（例如 `r e p o r t`）。應對精確用字與原生搜尋漏找的情況保持懷疑；對照渲染圖，或加上 `--ocr` 重新執行。
- **`raster_image_no_native_text`**（內部影像框偵測流程；不需要 flag）— 點陣影像主導頁面，但原生文字為空。影像內人類可見的文字不會出現在 `pages[].text` 中；若精確文字很重要，請對照渲染圖或 OCR。在原生文字為空的頁面上，此警告涵蓋 `large_raster_low_text_overlap`。
- **`large_raster_low_text_overlap`**（內部影像偵測流程；搭配 `--image-boxes` + `--layout`/`--geometry` 證據更強）— 當內部影像偵測流程看到一張大型點陣圖時，會出現在原生文字為空/稀疏的視覺頁面上。搭配 `--image-boxes` 加上 `--layout` 或 `--geometry` 時，它會把原生文字 bbox 與點陣區域比對，並附上 `imageBoxIndex` 以便精確追蹤。在 `raster_image_no_native_text` 已經觸發的空原生文字頁面上，不會輸出此警告。可以把它理解為「這張影像內的標籤、圖表文字、地圖文字或截圖文字，可能需要 `--render` / `--render-region` / OCR」。
- **`ocr_low_confidence`**（需要 `--ocr`）— OCR 信心分數低於 0.5，而原生擷取結果為空、稀疏、字形損壞，或依附於以點陣圖為底的文字層。應把 OCR 文字視為暫定結果；在信任表單標籤或小字之前，先對照 `--render`、調整 `--ocr-lang`，或裁切/重試。詳見 [`pdfvision docs ocr`](./ocr.md)。
- **`ocr_native_text_mismatch`**（需要 `--ocr`）— OCR 信心分數很高，原生擷取結果在其他方面是 `ok`，但 OCR 與原生文字明顯不一致。常見情況：自訂字型能正確顯示文字，但原生文字擷取結果卻是可列印字形替代字元；或以點陣圖為底的掃描頁上，高信心分數的 OCR 單字對應到錯誤的最近原生 token。請對照 `--render` 檢查；對於以點陣圖為底的頁面，優先採用有 OCR 支援的搜尋結果，而非漏找的原生搜尋。詳見 [`pdfvision docs ocr`](./ocr.md)。
- **`ocr_native_spacing_loss`**（需要 `--ocr`）— OCR 在以點陣圖為底的文字層上執行，信心分數很高，OCR 與原生文字包含相近的字元，但原生文字遺失了許多詞界（例如 `Ourwebsite` / `valuableresourcefor`），而 OCR 能還原正常的空格。若精確用字很重要，請對照渲染圖檢查 `ocr.text`。詳見 [`pdfvision docs ocr`](./ocr.md)。
- **`annotation_text_missing_from_native`**（內部註解偵測流程；不需要 flag）— 即使沒有指定 `--annotations`，可見 FreeText 註解內容未反映在 `pages[].text` 中。應把原生文字視為不完整；若精確可見文字很重要，請閱讀 `pages[].annotations`、使用 `--search`，或渲染該註解的 bbox。
- **`optional_content_text_may_include_hidden_layers`**（一律啟用的訊號）— 頁面文字串流包含被標記為 optional-content 的文字，而該 PDF 在檢視器預設狀態下至少有一個隱藏圖層。pdf.js 的文字擷取可能包含人類一開始看不到的圖層文字；在把 `pages[].text` 當成可見文字信任之前，請檢查 `--layers` 並對照 `--render`。
- **`reading_order_divergence`**（需要 `--layout`）— 帶頭的視覺閱讀順序標題只出現在原生文字串流的後半部（雜誌式版面排版錯亂——頁面標題被埋在 `text` 中段）；投影片式視覺上排最前的標題/頁首其實是最後繪製的，並出現在原生文字的末尾；靠後的頁底註記或右側邊欄出現在原生文字的開頭；同一區塊內重建的版面行以錯亂順序輸出；緊湊的數學文字以不符合視覺順序的方式被擷取；或 `--form-fields` 揭露的表單標籤，其原生文字順序與可見的列順序不同。當順序很重要時，優先採用 `layout.blocks` 的順序而非 `pages[].text`——這正是訊息在 JSON、XML 與 TOON 中所建議的處置方式。Markdown（因此也包括 MCP 工具）在這些頁面上本來就已經切換成以版面重建的內文，所以那裡的訊息會改說：這個順序落差是真的，你手上的文字已經是視覺順序，而當順序至關重要時，`--render-region` / `render_pdf` 是確認的步驟。
- **`xfa_form`**（一律啟用的文件層級訊號，附加在第一個被擷取的頁面上）— 該 PDF 宣告為 XFA（LiveCycle）表單，常見於政府表單。動態 XFA 會把真正的表單內容存放在標準擷取流程看不到的 XML 串流中：文字層通常只是「Please wait... upgrade Adobe Reader」這類檢視器預留字串，回報的頁數也可能塌縮成一個預留頁面。絕對不要用這段預留文字回答問題；請回報該文件是 pdfvision 無法擷取內容的 XFA 表單，並建議改用 Adobe Acrobat/Reader 開啟。JSON/TOON/函式庫使用頂層的 `xfa: true`；XML 使用 `<document xfa="true">`。

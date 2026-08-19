---
title: CLI 選項
description: pdfvision CLI 選項參考，涵蓋 PDF 輸入、輸出格式、渲染、OCR、搜尋、版面、metadata 與快取行為。
---

# CLI 選項

本頁依任務整理 CLI 參數。請執行 `pdfvision --help` 查看目前安裝版本的精確說明文字。

## 輸入

| 選項 | 用途 |
| --- | --- |
| `<file.pdf>` | 讀取本機 PDF 檔案。 |
| `--remote <url>` | 下載 HTTP(S) PDF，驗證 PDF header 後再擷取。除非同時傳入 `--no-cache`，否則會快取。 |
| `-p, --pages <range>` | 擷取 `1`、`1-5`、`1,3,5`、`2-4,7` 等頁碼範圍。預設擷取全部頁面。 |
| `--password <value>` | 使用密碼開啟加密 PDF。密碼不會寫入輸出。 |
| `--password-stdin` | 從管線 stdin 讀取密碼。stdin 為空時回退到 `--password`。 |

子命令會在解析任何選項之前被識別，且只在第一個引數位置被識別；傳給子命令的不支援引數會以結束碼 `1` 結束（`--help` 和 `--version` 在那裡仍然有效）。接著 CLI 會解析選項語法：遇到未知選項或缺少選項值時，即使同時提供 `--help` 也會以結束碼 `1` 結束。解析成功後，terminal action 的優先順序依次為 `--version`、`--help`、`--clear-cache`；這些操作會略過輸入檢查與擷取選項的語意驗證。其他情況下，pdfvision 會先 trim `--remote`。如果有多個位置引數，則會在檢查輸入來源是否存在之前以結束碼 `1` 結束。位置引數最多一個時，pdfvision 會檢查是否有非空位置引數或非空白的 `--remote` URL；兩者都沒有時，會在擷取、快取設定或擷取選項語意驗證前把完整 usage 輸出到 stderr，並以結束碼 `2` 結束。有可用輸入時的參數語意錯誤，以及快取清除失敗，均以結束碼 `1` 結束。

## 輸出格式

| 選項 | 用途 |
| --- | --- |
| `-f, --format <type>` | 輸出 `markdown`、`json`、`xml` 或 `toon`。預設是 `markdown`。 |
| `--markdown` | `--format markdown` 的捷徑。 |
| `--json` | `--format json` 的捷徑。 |
| `--xml` | `--format xml` 的捷徑。 |
| `--toon` | `--format toon` 的捷徑。 |
| `--no-normalize` | 停用 Unicode NFKC 正規化。啟用時，JSON/TOON 在 `pages[].rawText` 保留變更前文字，XML 使用同層 `<rawText>`，Markdown 省略它。 |

格式捷徑是嚴格的：傳入兩個不同捷徑，或捷徑與 `--format` 衝突，都會報錯。

以下 JSON 風格路徑僅對 JSON、解碼後的 TOON 和 `processDocument()` 精確有效。XML 對應 `page` → `no`、`pageLabel` → `label`、巢狀 `quality` → 展平屬性。頁面結果保留 rotation 屬性，overview rotation 目前省略，空欄位的存在方式也可能不同。

## 渲染

| 選項 | 用途 |
| --- | --- |
| `-r, --render` | 將每個選中頁面渲染為 PNG，並在頁面結果中附加影像路徑。 |
| `--render-output <dir>` | 指定頁面 PNG 或視覺區域 PNG 的輸出目錄。需要 `--render` 或 `--render-visual-regions`。 |
| `--render-scale <n>` | 設定 `--render`、`--render-visual-regions` 或 `--ocr` 的 rasterization 倍率。預設 `2`，範圍 `(0, 4]`。三個 flag 皆未指定時會報錯。 |
| `--render-region <x,y,width,height>` | 以未旋轉的原始 page-view units 渲染一頁中的矩形。需要 `--render` 或 `--ocr`，且 `--pages` 必須剛好解析為一個頁面。 |

座標使用左上原點：`x` 向右增加，`y` 向下增加。layout block、image box、vector box、search match 和 visual region 使用相同的原始 page-view units。物理點數 = 原始值 × `pages[].userUnit`（省略時按 1）；像素數 = 原始區域 × UserUnit × render scale。

## 版面與視覺結構

| 選項 | 用途 |
| --- | --- |
| `--geometry` | 在 `pages[].spans` 中輸出每個文字項目的 bbox 和字級。面向結構化格式。 |
| `--layout` | 重建行、區塊、直排 CJK、數字表格提示、Markdown 版面順序和版面警告。 |
| `--image-boxes` | 在 `pages[].imageBoxes` 中輸出 raster 影像 bbox。 |
| `--vector-boxes` | 在 `pages[].vectorBoxes` 中輸出向量繪製 bbox。 |
| `--visual-regions` | 輸出圖、圖表、表格、表單、註解以及 raster/vector 群集的可裁切區域。 |
| `--render-visual-regions` | 渲染視覺區域裁切圖，並附加路徑、content ratio 和更緊的 rendered content box。隱含 `--visual-regions`。 |
| `--strip-repeated` | 從 Markdown 移除重複區塊。需要 `--layout`；JSON/TOON 保留 `repeated: true`，XML 保留 `repeated="true"` 區塊屬性。 |

## 搜尋

| 選項 | 用途 |
| --- | --- |
| `--search <query>` | 尋找出現位置，並輸出帶 page、source、text、query 和 bbox 的 `pages[].matches[]`。可重複傳入。 |
| `--search-regex` | 將每個 `--search` 值當作 JavaScript 正規表示式。 |
| `--search-case-sensitive` | 精確區分大小寫。預設不區分大小寫。 |

搜尋預設感知 NFKC，可匹配原生文字、表單欄位、link targets、可見 FreeText 註解，以及啟用 `--ocr` 時的 OCR 文字。

## PDF 功能

| 選項 | 用途 |
| --- | --- |
| `--form-fields` | 輸出 widget 欄位、flags、actions、export values、選項、值、bbox 和附近可見標籤。Markdown 也會渲染表單欄位表。 |
| `--links` | 輸出連結註解、bbox、URL、命名目標，以及可解析的目標頁。 |
| `--annotations` | 輸出評論、highlight、stamp、檔案附件、形狀和 ink 等非連結註解。 |
| `--structure` | 當 PDF 提供 tagged-PDF 結構樹時輸出它。 |
| `--page-labels` | JSON/TOON 使用 `pageLabels` / `pages[].pageLabel`；XML 使用 `page` / `label` 屬性輸出檢視器頁碼標籤。 |
| `--attachments` | 輸出嵌入附件 metadata，不把檔案 bytes 嵌入結構化輸出。 |
| `--attachment-output <dir>` | 將嵌入附件寫入磁碟。需要 `--attachments`。 |
| `--outline` | 輸出文件大綱/書籤、層級、URL、動作和可解析的目標。 |
| `--viewer` | 輸出檢視器設定、open action、JavaScript action、權限和 MarkInfo。 |
| `--layers` | 輸出 optional content groups、可見狀態、radio groups 和檢視器面板順序。 |

## OCR

| 選項 | 用途 |
| --- | --- |
| `--ocr` | 執行 Tesseract OCR，並附加包含 text、confidence、language 和 word boxes 的 `pages[].ocr`。 |
| `--ocr-lang <lang>` | 指定 OCR 語言，例如 `eng`、`jpn` 或 `eng+jpn`。預設 `eng`。需要 `--ocr`，單獨使用會報錯。 |

OCR 不會取代 `pages[].text`；它會作為額外訊號並列輸出，方便代理比較原生文字與 OCR。

## 快取與說明

| 選項 | 用途 |
| --- | --- |
| `--no-cache` | 跳過擷取快取與遠端 PDF 快取。OCR support files 仍使用經過驗證的快取根目錄；未指定 `--render-output` 的渲染使用獨立的作業系統暫存路徑。 |
| `--clear-cache` | `clear-cache` 子命令的已淘汰別名。它仍會清除快取並顯示警告；將在 v1.0 中移除。 |
| `-v, --version` | 顯示 pdfvision 版本。 |
| `-h, --help` | 顯示 CLI 說明。 |

## 子命令

選項描述如何讀取 PDF。任何不讀取 PDF 的操作都是子命令，只在第一個引數位置被識別，不接受屬於自己的任何選項。`--help` 和 `--version` 是常見例外，包括子命令之後在內的任何位置都有效。

| 子命令 | 用途 |
| --- | --- |
| `clear-cache` | 只有在驗證 pdfvision 擁有權標記後，才清除設定的快取根目錄並結束。危險的廣泛根目錄、沒有標記的自訂根目錄及其他無法驗證的根目錄都會被拒絕。 |
| `mcp` | 透過 stdio 以 Model Context Protocol 提供 pdfvision 服務。請參閱 [MCP 伺服器](./mcp-server.md)。 |

如果檔案剛好命名為 `mcp` 或 `clear-cache`，必須以 `./mcp` 或 `./clear-cache` 的形式傳入。由於清除是破壞性操作，當工作目錄中存在該名稱的項目（包括連結目標不存在的 symlink）時，`clear-cache` 會以結束碼 `1` 拒絕執行，而不是用猜的。

## 結束碼

| 代碼 | 含義 |
| --- | --- |
| `0` | 成功，包括 `--help`、`--version` 和成功的 `clear-cache`。 |
| `1` | 選項語法錯誤；提供多個位置引數；有可用輸入時的參數語意錯誤；檔案不存在、網路/快取/clear-cache錯誤或擷取失敗。錯誤訊息會輸出到 stderr。 |
| `2` | 位置引數最多一個，且未提供非空位置引數或非空白的 `--remote` URL。完整 usage 會輸出到 stderr。 |

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

## 輸出格式

| 選項 | 用途 |
| --- | --- |
| `-f, --format <type>` | 輸出 `markdown`、`json`、`xml` 或 `toon`。預設是 `markdown`。 |
| `--markdown` | `--format markdown` 的捷徑。 |
| `--json` | `--format json` 的捷徑。 |
| `--xml` | `--format xml` 的捷徑。 |
| `--toon` | `--format toon` 的捷徑。 |
| `--no-normalize` | 停用 Unicode NFKC 正規化。啟用正規化時，JSON/XML 會在 `rawText` 保留變更前的文字。 |

格式捷徑是嚴格的：傳入兩個不同捷徑，或捷徑與 `--format` 衝突，都會報錯。

## 渲染

| 選項 | 用途 |
| --- | --- |
| `-r, --render` | 將每個選中頁面渲染為 PNG，並在頁面結果中附加影像路徑。 |
| `--render-output <dir>` | 指定頁面 PNG 或視覺區域 PNG 的輸出目錄。需要 `--render` 或 `--render-visual-regions`。 |
| `--render-scale <n>` | 設定 `--render`、`--render-visual-regions` 或 `--ocr` 的 rasterization 倍率。預設 `2`，範圍 `(0, 4]`。 |
| `--render-region <x,y,width,height>` | 只渲染一頁中的 PDF 點座標矩形。需要 `--render` 或 `--ocr`，且 `--pages` 必須解析為剛好一頁。 |

座標使用左上原點：`x` 向右增加，`y` 向下增加。layout block、image box、vector box、search match 和 visual region 使用同一座標系。

## 版面與視覺結構

| 選項 | 用途 |
| --- | --- |
| `--geometry` | 在 `pages[].spans` 中輸出每個文字項目的 bbox 和字級。面向結構化格式。 |
| `--layout` | 重建行、區塊、直排 CJK、數字表格提示、Markdown 版面順序和版面警告。 |
| `--image-boxes` | 在 `pages[].imageBoxes` 中輸出 raster 影像 bbox。 |
| `--vector-boxes` | 在 `pages[].vectorBoxes` 中輸出向量繪製 bbox。 |
| `--visual-regions` | 輸出圖、圖表、表格、表單、註解以及 raster/vector 群集的可裁切區域。 |
| `--render-visual-regions` | 渲染視覺區域裁切圖，並附加路徑、content ratio 和更緊的 rendered content box。隱含 `--visual-regions`。 |
| `--strip-repeated` | 從 Markdown 輸出中移除重複頁首、頁尾和頁碼區塊。需要 `--layout`，僅適用於 Markdown。 |

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
| `--page-labels` | 在 `pageLabels` 和 `pages[].pageLabel` 中輸出檢視器頁碼標籤。 |
| `--attachments` | 輸出嵌入附件 metadata，不把檔案 bytes 嵌入結構化輸出。 |
| `--attachment-output <dir>` | 將嵌入附件寫入磁碟。需要 `--attachments`。 |
| `--outline` | 輸出文件大綱/書籤、層級、URL、動作和可解析的目標。 |
| `--viewer` | 輸出檢視器設定、open action、JavaScript action、權限和 MarkInfo。 |
| `--layers` | 輸出 optional content groups、可見狀態、radio groups 和檢視器面板順序。 |

## OCR

| 選項 | 用途 |
| --- | --- |
| `--ocr` | 執行 Tesseract OCR，並附加包含 text、confidence、language 和 word boxes 的 `pages[].ocr`。 |
| `--ocr-lang <lang>` | 指定 OCR 語言，例如 `eng`、`jpn` 或 `eng+jpn`。預設 `eng`。 |

OCR 不會取代 `pages[].text`；它會作為額外訊號並列輸出，方便代理比較原生文字與 OCR。

## 快取與說明

| 選項 | 用途 |
| --- | --- |
| `--no-cache` | 跳過磁碟擷取快取。與 `--remote` 一起使用時，下載的 PDF 會直接處理，不寫入 remote-PDF 快取。 |
| `--clear-cache` | 清除擷取、渲染 PNG 和遠端下載快取後結束。 |
| `-v, --version` | 顯示 pdfvision 版本。 |
| `-h, --help` | 顯示 CLI 說明。 |

## 結束碼

| 代碼 | 含義 |
| --- | --- |
| `0` | 成功。 |
| `1` | 參數錯誤、檔案不存在、網路錯誤或擷取失敗。錯誤訊息會輸出到 stderr。 |

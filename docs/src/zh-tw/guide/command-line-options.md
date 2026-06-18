---
title: CLI 選項
description: 依輸入、輸出、版面、渲染、OCR、PDF 功能與快取整理 pdfvision CLI 選項。
---

# CLI 選項

本頁依任務整理主要參數。請執行 `pdfvision --help` 查看精確的目前說明文字。

## 輸入

| 選項 | 用途 |
| --- | --- |
| `<file.pdf>` | 讀取本機 PDF 檔案。 |
| `--remote <url>` | 下載 HTTP(S) PDF，快取並驗證後再擷取。 |
| `--pages <range>` | 指定頁碼範圍，例如 `1-5`、`3` 或 `1,3,5`。 |
| `--password <value>` | 開啟加密 PDF。 |
| `--password-stdin` | 從標準輸入讀取密碼，標準輸入為空時回退到 `--password`。 |

## 輸出

| 選項 | 用途 |
| --- | --- |
| `--format <type>` | 輸出 `markdown`、`json`、`xml` 或 `toon`。 |
| `--no-normalize` | 停用 Unicode NFKC 正規化。 |

## 渲染

| 選項 | 用途 |
| --- | --- |
| `--render` | 將選定頁面渲染為 PNG。 |
| `--render-output <dir>` | 指定渲染影像輸出目錄。 |
| `--render-scale <n>` | 設定 rasterization 倍率。 |
| `--render-region <x,y,width,height>` | 只渲染一頁中的指定矩形。 |

## 版面與視覺結構

| 選項 | 用途 |
| --- | --- |
| `--geometry` | 在 `pages[].spans` 中輸出文字項目 bbox 和字級。 |
| `--layout` | 重建行、區塊、直排 CJK、數字表格提示和版面警告。 |
| `--image-boxes` | 在 `pages[].imageBoxes` 中輸出 raster 影像 bbox。 |
| `--vector-boxes` | 在 `pages[].vectorBoxes` 中輸出向量繪製 bbox。 |
| `--visual-regions` | 輸出圖、表、表單、圖表等可裁切區域。 |
| `--render-visual-regions` | 渲染視覺區域裁切圖。 |

## PDF 功能

| 選項 | 用途 |
| --- | --- |
| `--form-fields` | 輸出表單欄位、標籤、選項與動作。 |
| `--links` | 輸出連結註解與解析後的目標。 |
| `--annotations` | 輸出非連結註解、附件與形狀幾何。 |
| `--structure` | 輸出 Tagged PDF 結構樹。 |
| `--page-labels` | 輸出檢視器頁碼標籤。 |
| `--attachments` | 輸出嵌入附件 metadata。 |
| `--outline` | 輸出書籤、URL 與動作。 |
| `--viewer` | 輸出檢視器設定與 JavaScript 動作。 |
| `--layers` | 輸出 Optional Content Group 與圖層順序。 |

## OCR 與快取

| 選項 | 用途 |
| --- | --- |
| `--ocr` | 執行 Tesseract OCR 並加入 `pages[].ocr`。 |
| `--ocr-lang <lang>` | 指定 OCR 語言，例如 `eng`、`jpn` 或 `eng+jpn`。 |
| `--no-cache` | 跳過磁碟快取。 |
| `--clear-cache` | 清除快取後結束。 |

---
title: 安全與隱私
description: 了解 pdfvision 如何處理本機檔案、遠端 PDF、密碼、快取目錄、OCR traineddata、附件、JavaScript 動作和敏感輸出審查。
---

# 安全與隱私

pdfvision 在本機執行。它不收集遙測資料，也不會把 PDF 內容上傳到服務端。

## 本機處理

本機檔案會在你的機器上處理。渲染影像、OCR traineddata、遠端下載和擷取快取會寫入 pdfvision 快取目錄，除非你明確指定輸出路徑。

```bash
pdfvision --clear-cache
```

該命令會刪除 pdfvision 管理的擷取、渲染、遠端下載和 OCR traineddata 快取。

## 遠端 PDF

`--remote` 會下載 HTTP(S) URL，並在擷取前驗證內容是否為 PDF。

```bash
pdfvision --remote https://example.com/document.pdf --format json
```

遠端伺服器仍然會看到這次請求。除非可以接受該網路存取，否則不要對私有 URL 使用 `--remote`。

只接受 `http:` 和 `https:` URL。會跟隨重新導向，但非 PDF response 會在進入 remote cache 前被拒絕。pdfvision 會檢查本文開頭附近的 PDF header，拒絕超過下載限制的回應，並使用 network timeout 防止 stalled server 無限佔用 CLI。

對於一次性的私有或過期 URL，使用 `--remote --no-cache`，這樣下載的 PDF bytes 不會寫入 remote-PDF cache。

## 密碼

PDF 密碼只用於 pdf.js 解密，不會出現在輸出中。

```bash
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```

CLI 工作流中優先使用 `--password-stdin`。

`--password <value>` 仍可作為明確 fallback，但它可能出現在 shell 歷史和程序列表中。

## 快取位置與權限

預設情況下，結果快取在作業系統暫存目錄下。用 `PDFVISION_CACHE_DIR` 控制位置：

```bash
PDFVISION_CACHE_DIR=/secure/cache pdfvision document.pdf --format json
```

快取可能包含擷取文字、渲染 PNG、遠端 PDF、OCR traineddata 和 OCR output。請選擇與所處理 PDF 相同敏感級別的快取目錄。

pdfvision 在 POSIX 系統上使用較嚴格的檔案權限，並防禦常見 symlink 與 time-of-check/time-of-use 快取問題。`--clear-cache` 會刪除設定 cache root 下由 pdfvision 管理的快取資料。

## 附件與 JavaScript actions

`--attachments` 可以暴露嵌入檔案 metadata；使用 `--attachment-output` 時會把嵌入檔案寫入磁碟。請把擷取出的附件視為 untrusted files。

附件檔名在寫入前會被 sanitize：路徑分隔符和控制字元會被替換，空名稱會獲得 fallback，重複名稱會 disambiguate。pdfvision 也拒絕把附件輸出寫入 symlinked output directory。這些檢查能降低 filesystem 風險，但不能讓嵌入檔案變得安全。

`--viewer` 和 form-field actions 可能把 PDF JavaScript source 作為資料暴露。pdfvision 不會執行 PDF JavaScript。

Viewer permissions 會作為 document metadata 報告。它們描述 PDF 希望 reader 允許或禁止什麼，不是安全邊界，也不應被當作 DRM enforcement。

## Search Regex 安全

預設搜尋把 query 當作 literal text。`--search-regex` 會把每個 query 編譯為 JavaScript regular expression，並在 native text、form-field text、clickable link targets、visible FreeText annotations，以及啟用 OCR 時的 OCR text 上執行。

只對可信 pattern 啟用 regex mode。pdfvision 會限制每個 query、page、source 輸出的 match 數，但 JavaScript regular expressions 仍可能在單次 catastrophic-backtracking match 中消耗過多時間。向 untrusted users 暴露 regex search 的應用應自行使用 timeout 或 worker isolation。

## 分享前檢查

結構化輸出可能包含文件文字、metadata、註解、表單值、連結、JavaScript 動作、附件名稱和渲染影像路徑。傳送給第三方 AI 服務前請先審查。

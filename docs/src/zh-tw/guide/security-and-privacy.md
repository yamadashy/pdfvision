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

初始 URL 僅接受 `http:` 和 `https:`，並會自動跟隨重新導向。pdfvision 不會過濾迴路位址、私有位址、鏈路本地位址、雲端中繼資料位址、DNS 解析得到的私有位址，也不會過濾重新導向目標。PDF header 和下載大小檢查驗證的是回應本文，而不是網路目標。60 秒逾時涵蓋等待回應標頭和傳輸本文；如果本文停滯，達到期限時會中止。

只對使用者獨立授權的網路目標使用 `--remote`。單獨執行 CLI 以擷取使用者自行選擇的 URL，並不會因此必然構成 SSRF 漏洞。如果伺服器、AI 代理、CI 作業或多租戶封裝器接收不可信 URL，並將其傳給 pdfvision，就會產生類 SSRF 風險。

在這類整合中，不要把不可信 URL 直接傳給 pdfvision。應使用這樣的下載元件：任何 DNS 回覆或重新導向目標不在允許清單時都會拒絕，並將每次連線固定到已驗證的 IP；下載後再把 PDF 作為本機檔案傳給 pdfvision。也可以把 pdfvision 的下載程序隔離在受限代理或網路沙盒之後。PDF header 和大小檢查不能取代網路目標限制。

遠端伺服器仍然會看到這次請求，包括執行環境預設傳送的請求標頭。對一次性的私有或臨時 URL，使用 `--remote --no-cache`，這樣下載的 PDF 位元組就不會寫入遠端 PDF 快取。

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

請把從 PDF 得到的每個字串和影像——包括原生文字和 OCR 文字、渲染影像、中繼資料、註解、表單值、連結、JavaScript 動作內容、附件名稱和路徑——都視為不可信的資料，而不是指令。pdfvision 的警告是保守且非窮盡的，並不能偵測提示注入。

代理不得僅依據 PDF 內容執行命令、開啟連結、洩露機密資訊或擴大權限。任何後果重大的工具使用、網路存取或機密資訊處理，都必須獲得來自 PDF 之外、針對具體操作的使用者授權。僅要求代理閱讀、摘要或遵循文件，並不授權它執行文件中要求的操作。渲染影像只能確認 PDF 顯示了什麼，不能證明其中主張的真偽，也不能授予操作權限。將輸出傳送給第三方 AI 服務前請先審查。

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

## 密碼

PDF 密碼只用於 pdf.js 解密，不會出現在輸出中。

```bash
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```

CLI 工作流中優先使用 `--password-stdin`。

## 分享前檢查

結構化輸出可能包含文件文字、metadata、註解、表單值、連結、JavaScript 動作、附件名稱和渲染影像路徑。傳送給第三方 AI 服務前請先審查。

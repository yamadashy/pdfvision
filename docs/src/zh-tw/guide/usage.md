---
title: 使用方式
description: 本機 PDF、遠端 PDF、頁碼範圍、渲染、版面、OCR 與加密 PDF 的常見用法。
---

# 使用方式

本頁展示常見命令模式。對於未知 PDF，先做結構化第一遍，檢查頁面 overview，再只在證據需要的地方加入版面、渲染、OCR、搜尋或視覺區域。

## 建議第一遍

```bash
pdfvision document.pdf --json
```

用它回答：

- 哪些頁面有可用的原生文字？
- 哪些頁面偏視覺、像掃描件或字形損壞？
- 哪些頁面有警告？
- 哪些頁面需要版面重建、OCR 或渲染裁切？

## 本機 PDF

```bash
pdfvision document.pdf
```

## 遠端 PDF

```bash
pdfvision --remote https://example.com/document.pdf --format json
```

遠端下載會被快取，並在擷取前驗證是否為 PDF。如果 `.pdf` URL 回傳 HTML、登入頁或挑戰頁，pdfvision 會在快取前失敗。

`--remote` 只接受 HTTP(S) URL，跟隨重新導向，並拒絕本文開頭附近沒有 PDF header 的回應。預設下載保護比較保守：最大 100 MB，網路逾時 60 秒。

遠端快取按 URL 建立。如果一個穩定 URL 的內容會被原地更新，可用 `--no-cache` 做一次新鮮取得，或用 `--clear-cache` 刪除快取副本：

```bash
pdfvision --remote https://example.com/document.pdf --no-cache --format json
```

## 頁碼範圍

```bash
pdfvision document.pdf --pages 1-3
pdfvision document.pdf --pages 1,3,5 --format json
```

頁碼範圍使用從 1 開始的實體頁碼。逗號組合多個選擇器，範圍包含兩端，重複頁會合併到排序後的輸出中。

有效範例：

- `1`
- `1-5`
- `1,3,5`
- `2-4,7`

空片段、0、負數、`5-3` 這樣的降序範圍和格式錯誤的範圍都會直接報錯，而不是猜測使用者意圖。如果選擇器包含超出文件末尾的頁，但至少選中了一個真實頁，pdfvision 會擷取真實頁，並為被跳過的頁發出警告。

## 渲染頁面

```bash
pdfvision document.pdf --render --render-output ./images --format json
```

使用 `--render-scale` 控制影像細節：

```bash
pdfvision document.pdf --render --render-scale 3
```

## 擷取版面與視覺結構

```bash
pdfvision document.pdf --layout --image-boxes --vector-boxes --visual-regions --format json
```

這會加入版面區塊、影像框、向量框、視覺區域與版面警告。

適用於雙欄論文、投影片、財務報告、表格、表單、圖表、圖示，以及任何視覺位置會改變含義的頁面。

## 只渲染重要區域

```bash
pdfvision document.pdf --render-visual-regions --render-output ./regions --format json
```

當不想渲染整頁，但需要查看圖、表、表單或圖表區域時使用。

## 搜尋並放大

```bash
pdfvision report.pdf --search "revenue" --format json
pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --format json
```

當 pdfvision 能定位證據時，搜尋結果會包含 bbox。把該 bbox 傳給 `--render-region`，即可產生用於視覺驗證的小裁切圖。

當答案必須綁定到可稽核的 PDF 證據時，這個模式很有用：先搜尋術語，選擇匹配頁和 bbox，再渲染最小可用裁切。

## 掃描頁 OCR

```bash
pdfvision scan.pdf --ocr --ocr-lang eng --format json
pdfvision japanese-scan.pdf --ocr --ocr-lang eng+jpn --format json
```

OCR 結果包含文字、信心分數、語言與單字框。

OCR 會附在原生文字旁邊，不會取代 `pages[].text`。代理可以先比較原生擷取與 OCR，再決定信任哪個證據。

## 表單、連結與註解

```bash
pdfvision form.pdf --layout --form-fields --annotations --links --format json
```

當 PDF 包含 widget 值、核取方塊、單選群組、可見評論、連結，或含義依賴頁面位置的表單標籤時使用。

## 目錄、頁碼標籤與文件功能

```bash
pdfvision document.pdf --page-labels --outline --viewer --layers --format json
```

當 PDF viewer 體驗有意義時使用這些選項：不同於實體頁碼的頁碼標籤、書籤、open action、optional content layer 或 viewer preferences。

## 加密 PDF

```bash
pdfvision encrypted.pdf --password your-password --format json
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```

當密碼不應出現在 shell 歷史或程序參數中時，優先使用 `--password-stdin`。

## 快取控制

```bash
pdfvision document.pdf --no-cache --json
pdfvision --clear-cache
```

pdfvision 會快取擷取結果、渲染影像、遠端下載和 OCR 資料，讓代理重複讀取同一 PDF 時更快。對一次性的敏感執行使用 `--no-cache`，用 `--clear-cache` 刪除快取資料。

當應用需要把快取放在已知目錄時，設定 `PDFVISION_CACHE_DIR`：

```bash
PDFVISION_CACHE_DIR=/secure/pdfvision-cache pdfvision document.pdf --json
```

對遠端 PDF，`--no-cache` 也會跳過遠端 PDF 快取，並把新下載的 bytes 直接送入擷取流程。當 URL 是私有、限時，或可能在沒有版本號的情況下變化時，這是最安全的選擇。

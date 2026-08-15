---
title: "OCR"
description: "OCR 語言代碼與順序、信心分數、traineddata 安裝與快取，以及疑難排解。非英文 OCR 必讀，因為語言順序會改變結果。"
sourceHash: bfac4068046b
---

<!-- Translated from docs/src/en/guide/ocr.md, which is generated from docs/cli-topics/ocr.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# OCR 參考文件

`--ocr` 旗標的詳細說明——何時該使用它、多語言行為、信心分數的語意、安裝／快取需求，以及疑難排解。當你要對非英文文字執行 `--ocr`、信心分數異常偏低，或需要診斷 `tesseract.js` 的安裝問題時，請閱讀本頁。

如果只是想了解基本流程（「頁面被點陣化了，執行 `--ocr -f json`」），`pdfvision --help` 就足夠了。

## 資料結構

```ts
interface PageOcr {
  text: string;              // OCR-derived text, trimmed
  confidence: number;        // 0..1 (rounded to 3dp). Tesseract reports 0..100 internally; pdfvision normalises.
  lang: string;              // canonicalised lang spec — whitespace-trimmed, order preserved
  words?: OcrWord[];         // OCR word boxes in page coordinates, when tesseract returns layout
}

interface OcrWord {
  text: string;
  confidence: number;        // 0..1 (rounded to 3dp)
  x: number; y: number; width: number; height: number;
}
```

`lang` 會在空白正規化後回顯呼叫端的 `--ocr-lang`，但會保留 token 順序。`eng+jpn` 與 `jpn+eng` 會產生不同的辨識器（tesseract 會把第一個語言當作主要語言），因此會落在不同的快取位置，並回顯不同的 `lang`。`words[]` 是選填欄位，因為較舊的快取項目或不尋常的 tesseract 輸出可能沒有 block/line/word 版面資訊；若存在該欄位，搜尋就能回傳 OCR 的字詞級 bbox。如果字詞級重建結果遺漏了一個以上、實際存在於完整 `ocr.text` 中的查詢比對（例如 OCR 的斷行或間距差異造成），搜尋會從 `ocr.text` 補上頁面層級的 bbox。

## 何時該執行 OCR

觸發依據是密度 Overview，而不是頁面內容本身。留意以下情況：

- `coverage: 0%`（或接近零）且 `imageCount > 0`——頁面主體被點陣化
- `text` 為空或亂碼（少數幾個雜散字元如 `r rv`）——PDF 字型表損壞
- 整份文件看起來都正常，但某一頁回傳空白——很可能是投影片／圖片／掃描頁

`pdfvision` 從不自動觸發 OCR。是否對某一頁執行 OCR，由代理在讀取密度訊號後自行決定。OCR 的成本約為每頁 0.5–2 秒（CPU 密集），外加一次性的幾秒工作者（worker）啟動時間；對一份 100 頁的論文每一頁都執行 OCR 通常不划算。

## 語言代碼與順序

`--ocr-lang` 採用 tesseract.js 的加號分隔格式：一個或多個以 `+` 連接的 3 字母代碼（或 `chi_sim` 這種形式）。

```bash
npx pdfvision doc.pdf --ocr --ocr-lang eng         # English only (default)
npx pdfvision doc.pdf --ocr --ocr-lang eng+jpn     # English + Japanese
npx pdfvision doc.pdf --ocr --ocr-lang chi_sim     # Simplified Chinese
npx pdfvision doc.pdf --ocr --ocr-lang eng+chi_sim+chi_tra
```

**順序很重要。**[Tesseract 文件](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html#order-of-multiple-languages)說明第一個語言會被當作主要語言，且語言順序會改變 OCR 輸出與執行時間。請把主要語言放在最前面：

- 對以日文為主、夾雜英文標題／標籤的投影片：`jpn+eng`
- 對以英文為主、偶爾夾雜日文詞彙的英文文件：`eng+jpn`
- 不確定時，兩種順序都跑一次，比較 `confidence` 與 `text`

pdfvision 在為快取建立鍵值之前，會先正規化語言字串中的空白（` eng + jpn ` 與 `eng+jpn` 會共用同一個快取位置），但**會保留順序**——`eng+jpn` 與 `jpn+eng` 是真正不同的辨識器，因此會刻意落在不同的快取位置。

回顯的 `pages[].ocr.lang` 會回傳空白正規化、順序保留的形式（`'eng+jpn'`，而非 `' eng + jpn '`）。

## 信心分數語意

`pages[].ocr.confidence` 的範圍是 `0..1`（四捨五入至小數點後 3 位）。Tesseract 內部回報 `0..100`，pdfvision 會除以 100 以符合既有的 `textCoverage` 慣例。

大致的判讀方式，僅供參考：

- `>= 0.8`——高信心，OCR 文字對大多數代理用途可直接使用
- `0.5–0.8`——可用，但重要實體（數字、姓名、代碼識別碼）需要再驗證
- `< 0.5`——部分辨識成功。可能是 `--ocr-lang` 選錯、掃描解析度過低，或字體風格特殊。在原生擷取為空、稀疏、字形損壞，或落在點陣支撐的文字層上的類掃描頁面上，這也會顯示為 `pages[].warnings[].code === 'ocr_low_confidence'`。在信任該文字之前，先透過 `--render` 與渲染出的 PNG 比對。

高信心分數也可能揭露原生文字層本身的品質問題。在點陣支撐的掃描頁面上，`pages[].warnings[].code === 'ocr_native_text_mismatch'` 代表 OCR 找到了高信心度的字詞，但其最接近的原生 token 卻不同，因此精確的原生搜尋可能會漏掉可見的字詞。`pages[].warnings[].code === 'ocr_native_spacing_loss'` 代表 OCR 與原生文字包含相近的字元，但原生文字遺失了大量的字詞邊界。在使用 `pages[].text` 中的精確措辭之前，建議先比較 `ocr.text` 與渲染結果。

`confidence: 0` 加上空的 `ocr.text` 通常代表點陣化步驟產生了一張空白頁（見下方「疑難排解」），而不是 OCR 真的什麼都沒找到。**請先檢查 `pages[].quality.visualStatus`**：當它是 `blank` 時，代表渲染結果本身是空白的，OCR 沒有東西可處理；當它是 `sparse` 時，代表頁面上有極小的可見痕跡，應該先用幾何資訊或裁切圖檢查，再回報「沒有文字」。

## 輸出結構

```ts
interface PageOcr {
  text: string;        // trimmed of trailing whitespace, line breaks preserved
  confidence: number;  // 0..1, page-level mean
  lang: string;        // whitespace-normalised, order-preserved
  words?: OcrWord[];   // OCR word boxes in page coordinates, when tesseract returns layout
}

interface OcrWord {
  text: string;
  confidence: number;  // 0..1, word-level confidence
  x: number; y: number; width: number; height: number;
}
```

`pages[].text`（由 pdfjs 擷取而來）**絕不會**被 OCR 覆寫——兩個訊號會同時存在於同一個頁面物件上，讓代理可以比對並自行判斷。掃描版 PDF 通常會顯示空的 `text` 搭配已填入的 `ocr.text`；混合內容的 PDF 則會在 `text` 中有原生文字，並在 `ocr.text` 中有另一種 OCR 判讀結果（對模糊字形而言是很有用的合理性檢查）。`ocr.words[]` 是選填欄位，因為 tesseract 偶爾會省略版面區塊，但若存在該欄位，就能讓 `--search` 回傳 OCR 的字詞級 bbox。如果字詞級重建結果遺漏了一個實際存在於完整 `ocr.text` 中的查詢字詞（例如 OCR 的斷行或間距差異造成），搜尋會退回使用 `ocr.text` 搭配頁面層級的 bbox，而不是直接捨棄該筆比對。

在 XML 輸出中，沒有字詞框的 OCR 會呈現為 `<ocr lang="..." confidence="...">...</ocr>`。當字詞框存在時，`ocr` 元素會包含 `<text>` 與 `<words><word .../></words>` 子元素。自我封閉的 `<ocr lang="..." confidence="0"/>` 代表 OCR 有執行但沒有產生文字——這與該標籤完全不存在（代表未要求 OCR）不同。

## 安裝需求

`tesseract.js` 宣告在 `optionalDependencies` 中。預設的 `npm install pdfvision` 會一併安裝它（約 30 MB 的工作者套件）；`npm install --omit=optional` 則會跳過它。

當要求 `--ocr` 但未安裝 `tesseract.js` 時，pdfvision 會拋出：

```text
--ocr requires the optional dependency "tesseract.js" (not installed).
Install it with: npm install tesseract.js
```

其他 import 時期的錯誤（原生綁定損壞、遞移相依的語法錯誤）會顯示真實的錯誤訊息，而不是這則安裝提示——讓代理不會被誤導。

## Traineddata 快取

Tesseract 會在首次使用時，下載各語言專屬的 `*.traineddata` 檔案（每個約 10–15 MB）：

- `eng.traineddata` ≈ 10 MB
- `jpn.traineddata` ≈ 13 MB
- `chi_sim.traineddata` ≈ 16 MB

pdfvision 會把 tesseract.js 指向 `<cache-root>/ocr-data/`（POSIX 權限 0700），這樣可以：

- 讓資料落在 pdfvision 自己的快取層級中（權限一致、位置單一）
- `npx pdfvision clear-cache` 會連同擷取快取一併清除 traineddata
- 下載每個語言只會發生一次；之後的執行都是離線的

首次針對新語言呼叫 `--ocr` 時，下載會多花幾秒鐘。之後對同一語言的呼叫，在啟動步驟上是即時的（工作者初始化仍需約 1–2 秒）。

`--no-cache` 不會停用這些 OCR 支援檔案：OCR 仍會驗證設定的快取根目錄，並將 traineddata 及其工作者輔助檔案保存在那裡。

## 疑難排解

### 第一次執行 --ocr 時無害的 stderr 雜訊

當 `--ocr` 在一個 session 中第一次啟動 tesseract.js 時，你可能會看到如下的 stderr 訊息：

```text
Error opening data file ./.traineddata
Failed loading language ''
```

這些是 tesseract.js 內部啟動流程中**無害的預先探測**，不是致命錯誤。辨識器之後仍會遵循你實際傳入的 `--ocr-lang`。可以透過檢查 JSON 輸出中的 `pages[].ocr.confidence` 來確認——如果它 `> 0` 且 `pages[].ocr.text` 有內容，代表 OCR 成功了。不要把這些 stderr 訊息當作中止執行的理由。

### 「OCR 執行了，但 `text` 是空的，`confidence: 0`」

最可能的原因是點陣化步驟產生了一張空白頁，而不是 OCR 真的失敗了。常見原因：PDF 使用了 pdfjs + `@napi-rs/canvas` 無法解碼的影像格式（尤其是 JPEG2000 / JPX，常見於 Internet Archive 的掃描件）。先檢查 `pages[].quality.visualStatus`：`blank` 代表 OCR 收到的輸入接近純色，`sparse` 代表有極小的可見痕跡，值得用幾何資訊或裁切圖檢查。可用以下方式驗證：

```bash
npx pdfvision doc.pdf -p <page> --render --render-output /tmp/dbg
# Inspect /tmp/dbg/page-<n>.png — if it's blank, OCR has nothing to chew on.
# (--render-output writes flat; a name another PDF already took in the same
# dir gets a -2 suffix and a note on stderr.)
```

這是已知限制，與 OCR 本身分開追蹤。變通方法：換一份不同來源的 PDF 副本，或在呼叫 pdfvision 之前，用 wasm 解碼器先行解碼 JPX 串流。

### 「信心分數中等，但文字明顯有問題」

一種可能是 `--ocr-lang` 設定錯誤——頁面包含了規格中未列出的語言，或主要語言沒有放在最前面（例如以日文為主的頁面用 `eng+jpn` 而不是 `jpn+eng` 執行）。可以試試相反的順序並比較結果。

另一種可能是解析度過低。pdfvision 會以 2 倍縮放對 OCR 輸入進行點陣化，並將其視為下限：`--render-scale 1` 會縮小 `--render` 的 PNG，但 OCR 的點陣化仍維持 2 倍，因此只有大於 2 的數值才會改變 tesseract 看到的內容。對於真正的小字印刷，可先試試 `--ocr --render-scale 3`（支援範圍為 `(0, 4]`）。如果仍不夠，可另外渲染更高解析度的 PNG，再直接交給 tesseract.js 處理。

### 「OCR 很慢——N 頁 × M 秒讓人受不了」

- 限制頁碼範圍：用 `-p <range>` 只對需要的頁面執行 OCR（利用密度 Overview 挑選）。
- 單一工作者會在同一次呼叫中跨頁重複使用，因此一次 10 頁的 OCR 執行只會支付一次啟動成本，加上 N 次逐頁成本。分成多次呼叫會讓每次都重新支付啟動成本。
- pdfvision 的頁面層級平行處理**不適用於** OCR（設計上只使用單一工作者）。啟動多個工作者只會讓記憶體用量以每種語言約 30 MB 倍增，卻沒有實質效益。

### 「我希望 OCR 覆寫 `text`，這樣下游消費者就不用自己選擇了」

設計上就是不會這樣做。應該由代理／下游消費者自行決定要用哪個訊號。如果某個消費者只想要單一欄位，可以在使用時自行挑選：

```ts
const effectiveText = page.text || page.ocr?.text || '';
```

同時保留兩個訊號，代表隨時都能做合理性檢查（比較原生文字與 OCR 是否有歧義）。

## 範例

```bash
# Japanese-dominant slide deck with English titles
npx pdfvision slides.pdf --ocr --ocr-lang jpn+eng -f json

# English paper with embedded Chinese citations
npx pdfvision paper.pdf --ocr --ocr-lang eng+chi_sim -f json

# Scanned book, English only
npx pdfvision scan.pdf -p 1-20 --ocr -f json | \
  jq '.pages[] | {page, conf: .ocr.confidence, head: .ocr.text[0:120]}'
```

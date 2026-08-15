---
title: "版面與幾何資訊"
description: "--layout 的區塊／行／表格結構、多欄閱讀順序、重複裝飾元素、標題層級，以及 --geometry 的文字片段結構。當需要重建結構或閱讀順序，而非只讀取純文字時使用。"
sourceHash: d1f8f8095566
---

<!-- Translated from docs/src/en/guide/layout.md, which is generated from docs/cli-topics/layout.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# 版面與文字片段幾何資訊

適用於 `-f json`、`-f xml` 與 `-f toon` 使用者的參考文件。

## 版面（`--layout`）

```ts
interface PageLayout {
  blocks: LayoutBlock[];     // in approximate reading order (multi-column aware)
  tables?: LayoutTable[];    // row-major hints for aligned numeric tables
}

interface LayoutBlock {
  text: string;              // line texts joined with \n
  x: number; y: number; width: number; height: number;
  lines: LayoutLine[];
  writingMode?: 'vertical';  // present for detected CJK top-to-bottom glyph stacks, including body text
  role?: 'heading';          // heuristic heading classification — see `level`
  level?: 1 | 2 | 3;         // present iff role === 'heading': 1=title, 2=section, 3=subsection candidate
  repeated?: boolean;        // chrome (running header / footer / page number / watermark), usually detected across pages
}

interface LayoutLine {
  text: string;
  x: number; y: number; width: number; height: number;
  fontSize: number;          // most common fontSize across the spans in this line
  writingMode?: 'vertical';  // present for top-to-bottom CJK glyph stacks, including body text
}

interface LayoutTable {
  x: number; y: number; width: number; height: number;
  rowCount: number;
  columnCount: number;       // maximum cells in any row
  rows: LayoutTableRow[];
}

interface LayoutTableRow {
  y: number; height: number;
  cells: LayoutTableCell[];  // sorted left-to-right
}

interface LayoutTableCell {
  text: string;
  x: number; y: number; width: number; height: number;
}
```

`--layout` 會加入一個帶有幾何資訊與角色提示的替代閱讀順序視圖；它絕不會取代原生文字。在 JSON/XML/TOON 中，`pages[].layout` 只在指定 `--layout` 時才會出現，而 `pages[].text` 則維持為未經改動的 pdf.js 文字串流，因此區塊與原始文字可以互相比對。Markdown 是例外：它內部一律會執行版面分析，因此只要存在任何區塊，每頁的內文就會是以版面重建出的閱讀順序，只有在完全沒有區塊時才會退回使用 `pages[].text`；在 Markdown 中，`--layout` 只控制結構性的額外內容——也就是每頁的版面表格區段，以及 Overview 中的 `Blocks` / `Tables` 欄。注意這裡沒有 `pages[].layout.lines`——行資料位於 `blocks[].lines` 之下。

多欄閱讀順序：`blocks[]` 會先由上到下讀完左欄，再讀右欄。版面分析會把重複出現的窄邊溝與重複出現的右側面板起點視為欄／表格分隔線，包括橫向頁面中數字側面板代表主體欄只涵蓋實體頁面寬度一部分的情況。當 pdf.js 把單字輸出為各自獨立的 span 時，會保留緊密的拉丁文與阿拉伯文字間距；會把簡短、字距加大的 CJK 標題行保持在同一行（例如「科 学」）；會把縮排的單行文字附著到最鄰近的現存欄，而不是把它變成橫跨整頁的分隔線；會避免高大的首字放大字母（drop cap）吞掉後面的段落行；會讓窄小的獨立數字頁碼標籤與周圍的正文分開；並會把底部的小型版權／頁尾說明移到雙欄主體之後。它也會偵測本文大小的單字符 CJK 直排、緊湊的顯示型 CJK 字符堆疊，以及視覺上呈直排的高瘦 CJK span；當幾何資訊與來源順序一致時，會把縱中橫（tatechuyoko）數字群保留在同一直排欄內；會把每一欄由上到下串接；會把相鄰的內文欄由右至左分組，並在欄與欄之間插入 `\n`；並會為這些區塊／行標上 `writingMode: "vertical"`，讓使用端不會誤把它們當成橫排列。當相鄰的直排注音欄，或上方的橫排假名行，能對應到明確的 CJK 本字範圍時，振り仮名／ルビ（furigana/ruby）會以 `base《ruby》` 的形式附加到版面文字上；否則會保持排除，而不是變成獨立的版面雜訊。直排本文欄右側邊溝中，簡短的中等大小注釋參照記號也會被排除，而不會變成獨立的版面區塊。`pages[].text` 對同樣的本文大小直排偵測器，只會以串流順序的方式進行合併：當來源項目順序已經與由上到下的幾何資訊一致時，它會合併該偵測到的直排欄；否則會逐段退回，而不會重新排序。獨立的第 1 級／第 2 級標題會作為分欄的分隔線；第 3 級候選則會留在原欄內，避免子章節分隔打亂閱讀順序。區塊分群仍然是啟發式的——表格儲存格有可能會合併成單一區塊。

重複裝飾元素（chrome）的偵測發生在區塊分群之後。當多行的邊緣區塊中只有一行是重複的頁面裝飾元素——例如黏在附近內文旁的投影片頁尾——pdfvision 會把該行拆成獨立的 `repeated: true` 區塊，並讓相鄰的內文行維持非重複狀態。這個確切欄位存在於 JSON/TOON 中；XML 使用 `<block repeated="true">`；Markdown 只有在加上 `--strip-repeated` 時才會省略該區塊。頁面左右邊緣的窄直排區塊，在被判定為裝飾元素之前也需要佐證：含有「。」或「、」的類句子文字，以及長度超過短裝飾元素上限的直排邊緣文字，絕不會被標記為 `repeated`；在多頁擷取中，同一段正規化後的短邊緣文字必須至少在兩個選取頁面上重複出現；在單頁擷取中，只有像「第」、「章」、數字，或「第1章」這類保守的短標記才會被標記。像「Yes.」、「No.」與「STOP」這類簡短的表單控制標籤，即使在決策樹式的指示中重複出現在頁面邊緣，也不會被當作頁面裝飾元素。

`tables[]` 是針對對齊數字表格的保守型行主序提示。它會在多行擁有數個儲存格、且至少兩個數字儲存格時出現，這是財務報表與政府統計表格常見的形狀；當足夠多的規則行讓表格形狀夠清楚時，也會納入緊湊的雙欄年份／數值表格。請把它視為視覺結構的輔助工具，而不是完整的表格剖析器：合併儲存格的表頭、延續標籤與註腳，仍可能需要用 `--render` / `--render-region` 來處理，但 `rows[].cells[]` 保留了 `blocks[]` 在表格被拆成標籤欄與數字欄時常常會遺失的行／儲存格順序。密集且重複出現的數字邊溝，會在建構表格之前先被切分，這樣當視覺網格規則時，相鄰的數值就不會塌陷成同一個儲存格，包括帶有千分位逗號數值或比率儲存格（例如 `13.0x`）的緊湊側邊表格。含有三個以上數字 span 的密集行，也可以切分同一行內的窄數字邊溝，包括財務報表中，尾端貨幣符號在視覺上標示出下一個數值欄的情況。有三個以上重複出現數字欄的寬表格，也可以保留簡短的前導表頭行，以及緊接在第一個完整填滿的行之前的稀疏首行，包括像 `1.0 · 10^20` 這樣的科學記號儲存格，以及像 `298 / 400 (~90th)` 這樣的分數／百分位儲存格，讓表格 bbox 從人眼可見的表格頂部開始。來自出版商表格邊框的裝飾性點狀分隔線文字，在分組行時會被忽略，因此高的點狀邊框不會把所有儲存格都吞併成同一行。附近僅含標籤的延續行，除非看起來像是章節標題，否則會被併入下一行的標籤中。當帶標籤的行擁有重複出現的數字欄時，即使行距不規則也仍會被接受，因此帶有多行標籤、小計間隔，以及在重複年份欄之前有長篇散文式標籤的財務表格，仍會保持可見，而不會被誤判為相鄰的一般段落而被裁掉。當行位置能明確判斷關聯時，脫離的貨幣符號會被併入後面的數字儲存格。

### 標題層級（`role === 'heading'`）

當某個區塊被分類為標題時會設定 `role`；`level` 則標示視覺層級：

- `level: 1`——論文／頁面標題（字型大小 ≥ 內文中位數的 1.40 倍，或位於頁面頂部、落在 ≥ 1.25 倍區間的文件標題）。
- `level: 2`——章節標題（在舊規則下 ≥ 1.25 倍，或在有結構性佐證時 ≥ 1.15 倍：簡短，且要嘛獨立成行，要嘛在區域內比鄰近文字大）。可捕捉典型 LaTeX 12pt 對 10pt 的章節樣式。
- `level: 3`——子章節候選（≥ 1.08 倍，單一短行，在同一欄的鄰近文字中屬於較大者）。信心較低，屬於類似 ResNet 論文中 `3.1.`、`3.4.` 那種標題。

依使用情境挑選合適的子集：
- 只要標題：`role === 'heading' && level === 1`。
- 高精確度（僅章節）：`role === 'heading' && level <= 2`。
- 偏重召回率（包含子章節）：所有 `role === 'heading'`。

重複裝飾元素的判定優先於標題分類。當一個標題外形的重複頁首／頁尾被標記為 `repeated: true` 時，pdfvision 會移除 `role`、`level` 與 `roleConfidence`，避免重複的頁面裝飾元素出現在標題清單中。在對內文做分塊處理時，仍應先過濾掉 `repeated: true` 的內容。
## 文字片段（`--geometry`）

```ts
interface TextSpan {
  text: string;              // NFKC-normalized and C0-cleaned by default (disable with --no-normalize)
  x: number; y: number;      // unrotated page view, top-left origin
  width: number; height: number;
  fontSize: number;          // largest finite non-zero text-matrix scale; otherwise reported/effective item height
  fontName?: string;         // stable page-local alias e.g. "font1"
}
```

每個公開的文字片段（span）對應一個保留下來的、已定位的 pdf.js 文字項目，其 `text` 可能是單一字元、一個單字，或更長的字串。相鄰項目不會在公開的 `spans[]` 中被合併或拆分；版面重建／搜尋可能會重建行或切出比對框，但不會改變這個顆粒度。四捨五入後的 bbox 是該項目的整體軸對齊外框，而不是個別字符的輪廓。去重動作發生在正規化之前。其去重鍵值使用原始 `str`、原始 `fontName`（若無則為空）、寬度、有效高度，以及每個轉換分量四捨五入至小數點後三位的值（若不存在則為 `no-transform`）。有效高度是正數的回報高度；若無，則採用最大的有限非零文字矩陣縮放值；若仍無，則為零。`fontSize` 優先採用該最大可用的矩陣縮放值，只有在兩個矩陣縮放值都不可用時，才會退回使用回報／有效項目高度。去重時會保留第一個項目，並對 `hasEOL` 取 OR；相同的原始文字在不同轉換下仍視為不同項目，而不同的原始項目經正規化後也可能得到相同的公開文字。沒有轉換的項目（很可能是印前製作用文字）、純空白項目，以及正規化後變成空字串的項目都會被省略。`fontName` 是穩定的頁面本地別名。幾何資訊可能會大幅增加輸出大小。

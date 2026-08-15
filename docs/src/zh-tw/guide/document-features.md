---
title: "文件功能"
description: "文件層級輸出格式：--structure 標記樹與表格、--page-labels、--attachments、--outline、--viewer 狀態，以及 --layers。當導覽、無障礙標記、嵌入檔案或選用內容有影響時使用。"
sourceHash: d215b9d959bd
---

<!-- Translated from docs/src/en/guide/document-features.md, which is generated from docs/cli-topics/document-features.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# 文件層級功能

供 `-f json`、`-f xml` 與 `-f toon` 使用者參考。

## 結構（`--structure`）

```ts
interface PageStructureNode {
  role: string;                 // tagged-PDF role, role-map-resolved by pdf.js when possible
  alt?: string;                 // alternate text, often figure/formula descriptions
  mathML?: string;              // MathML for Formula nodes when pdf.js exposes it
  lang?: string;                // language hint for this structure node
  bbox?: number[];              // [x, y, width, height] in page-view top-left user space
  children: PageStructureItem[];
}

type PageStructureItem = PageStructureNode | PageStructureContent;

interface PageStructureContent {
  type: string;                 // usually "content", "object", or "annotation"
  id: string;                   // pdf.js id that maps to marked content, an object, or an annotation
}

interface PageStructureTable {
  rows: { cells: PageStructureTableCell[] }[];
}

interface PageStructureTableCell {
  text: string;
  header?: 'column' | 'row';
}
```

`pages[].structure` 會呈現標記式 PDF（tagged-PDF）結構樹，也就是人類讀者可透過 PDF 檢視器的無障礙功能層存取的結構。這對於具備無障礙標記的政府 PDF、手冊、報告與表單特別有用，因為圖片的 `alt` 文字往往比原生文字擷取更能描述視覺區域。舉例來說，IRS（美國國稅局）的說明文件可以透過 `alt` 呈現封面圖片完整的人工撰寫描述，即使原生文字串流只列出片段內容。結構的 `bbox` 值採用 `[x, y, width, height]`，座標系統與 `spans`、`layout.blocks`、`imageBoxes` 相同，都是未旋轉的頁面檢視、左上角原點系統。結構字串中的雜散控制位元組（control bytes）會在輸出前移除，避免格式不良的 `alt` / `lang` 值把 NUL 位元組洩漏進 JSON、XML、Markdown 或 TOON。`structure: null` 代表這個處理階段已執行，但 pdf.js 沒有找到頁面結構樹；`structure` 欄位不存在則代表未要求 `--structure`。`overview[].structureNodeCount` 會鏡射結構節點數量，讓處理多頁文件的使用者可以在走訪每一棵樹之前，先找出有標記的頁面。

`pages[].structureTables` 會透過比對結構內容 id 與已載入文字串流中的標記內容（marked-content）id，重建 `Table` 角色。它支援 `THead` / `TBody` / `TFoot` 包裝元素，也支援直接作為子節點的 `TR`。位於 `TBody` 中的 `TH` 是列標頭（row header）；其他被包裝的 `TH` 儲存格則是欄標頭（column header）。對於沒有包裝的列，`TH` 儲存格預設視為列標頭，除非整列都是 `TH`，這時該列會被歸類為欄標頭。空的標記儲存格會保留為空字串。同一儲存格內的多個段落以 `<br>` 連接，巢狀表格則會被攤平併入父儲存格文字。pdf.js 並未提供表格的合併範圍（span）或明確的 `/Scope`，因此無法表示 `RowSpan` / `ColSpan`，標頭方向的判斷屬於啟發式推測。跨頁分割的表格不會被合併。當文件中沒有標記的 `Table` 時，此欄位會不存在；它與依幾何位置推導的 `layout.tables[]` 彼此獨立，因此同時要求 `--layout` 與 `--structure` 可能會讓同一個可見表格出現兩次。
## 頁碼標籤（`--page-labels`）

`pageLabels[]` 是來源 PDF 完整的檢視器頁碼標籤陣列，索引從實體第 1 頁對應到陣列索引 0。當 PDF 定義了頁碼標籤時，`pages[].pageLabel` 與 `overview[].pageLabel` 會鏡射所選頁面對應的項目。適用於 PDF 檢視器把前置內容顯示為 `i`、`ii`……並在正文重新從 `1` 開始編號，或章節使用 `A-1` 這類前綴的情況。CLI 的頁面選擇器仍然使用實體頁碼；`pageLabel` 則是告訴代理人類在檢視器介面上實際看到的頁碼。
## 附件（`--attachments`）

```ts
interface DocumentAttachment {
  name: string;          // decoded filename shown by the PDF viewer
  rawName?: string;      // raw PDF filename when it differs from name
  description?: string;  // file-spec description when present
  size: number;          // embedded file byte length
  path?: string;          // saved path, present when --attachment-output was provided
}
```

`attachments[]` 會呈現內嵌檔案附件，也就是人類 PDF 檢視器在附件面板或頁面檔案附件圖示中顯示的內容。附件的位元組資料刻意不包含在 JSON/XML/Markdown/TOON 輸出中；請把中繼資料當作「這份 PDF 含有補充檔案」的訊號，而不會用任意二進位內容塞爆代理的 context。當代理需要磁碟上的實際檔案時，搭配 `--attachments` 傳入 `--attachment-output <dir>`；pdfvision 會把檔案寫入依每份 PDF 指紋建立的子目錄下，並填入 `attachments[].path`。
## 目錄（`--outline`）

```ts
interface DocumentOutlineItem {
  title: string;
  type?: 'destination' | 'url' | 'action';
  target?: string;              // named/internal destination, explicit-destination JSON, URL, or action name
  page?: number;                // 1-based, resolved when pdf.js can map the destination
  items?: DocumentOutlineItem[];
}
```

`outline[]` 會呈現文件目錄／書籤，也就是人類 PDF 檢視器側邊欄顯示的內容。它會保留巢狀層級、外部 URL、像 `NextPage` 這類具名檢視器 action，並在可能的情況下把具名或明確的 PDF 目的地（destination）解析成從 1 開始的頁碼。`outline: []` 為空陣列代表這個處理階段已執行，但這份 PDF 沒有目錄；`outline` 欄位不存在則代表未要求 `--outline`。
## 檢視器狀態（`--viewer`）

```ts
interface DocumentViewerState {
  pageLayout?: string;          // initial layout such as TwoColumnLeft
  pageMode?: string;            // initial mode such as UseOutlines or UseThumbs
  viewerPreferences?: Record<string, JsonValue>;
  openAction?: {
    type: 'destination' | 'action';
    target?: string;            // destination JSON/name when type is destination
    page?: number;              // 1-based, resolved when possible
    action?: string;            // PDF action name for non-destination actions
  };
  jsActions?: Record<string, string[]>; // document-level JavaScript action scripts
  permissions?: {
    flags: number[];            // raw PDF permission flags
    allowed: string[];          // decoded names; empty means permissions were present but none matched
  };
  markInfo?: {
    marked: boolean;            // tagged-PDF / structure presence signal
    userProperties: boolean;
    suspects: boolean;
  };
}
```

`viewer` 會呈現人類 PDF 檢視器在讀取頁面文字之前使用的文件層級狀態：側邊欄／頁面模式、頁面版面（layout）、像 `DisplayDocTitle` 這類偏好設定、目錄的 `OpenAction`、像自動列印指令碼這類文件 JavaScript action，以及權限旗標與標記式 PDF 的 `MarkInfo`。文件是否含有 JavaScript 一律可透過 `javascriptActionCount` 得知；`--viewer` 則會把它展開成 action 名稱與指令碼原始碼，放在 `viewer.jsActions` 底下。同一次 `--viewer` 處理也會在頁面定義了 `PageOpen` / `PageClose` 這類頁面層級 JavaScript action 時，把它們輸出到 `pages[].jsActions`。為了可讀性，Markdown 會縮短過長的 JavaScript action 摘要；JSON、XML 與 TOON 則保留完整的結構化值。適用於開啟位置、書籤／側邊欄模式、JavaScript 觸發的檢視器行為、複製／列印權限，或標記式 PDF 結構會影響導覽或無障礙體驗的規格書、手冊、論文、表單與長篇報告。`viewer: {}` 為空物件代表這個處理階段已執行，但沒有檢視器層級的設定；`viewer` 欄位不存在則代表未要求 `--viewer`。
## 圖層（`--layers`）

```ts
interface DocumentLayers {
  name?: string;                 // optional-content configuration name
  creator?: string;              // optional-content configuration creator
  order?: DocumentLayerOrderItem[]; // viewer layer-panel order, including nested groups
  groups: DocumentLayerGroup[];
}

type DocumentLayerOrderItem = string | { name?: string; order: DocumentLayerOrderItem[] };

interface DocumentLayerGroup {
  id: string;                    // PDF optional-content group id, e.g. "4R"
  name?: string;                 // layer name shown by PDF viewers
  visible: boolean;              // display-intent visibility after the default config is applied
  intent?: string[];             // OCG intent names such as View or Design
  usage?: {
    viewState?: 'ON' | 'OFF';
    printState?: 'ON' | 'OFF';
  };
  rbGroups?: string[][];         // mutually exclusive radio-button layer groups
}
```

`layers` 會呈現 PDF 的選用內容群組（optional content group），也就是人類 PDF 檢視器針對地圖、CAD／設計檔案、多語言版本與大量疊層文件所提供的圖層面板。當可見內容可能取決於某個被切換的圖層，或地圖／設計頁面光看文字、向量與影像顯得不完整時，可使用此選項。`groups[].visible` 反映的是套用文件預設選用內容設定之後，pdf.js 判斷的顯示意圖可見性。pdf.js 的文字擷取可能會包含在預設檢視器狀態下被隱藏的選用內容群組所標記的文字；當 `pages[].warnings[].code === "optional_content_text_may_include_hidden_layers"` 時，請先用 `--render` 比對 `pages[].text` 並檢查 `--layers`，再判斷該文字是否確實等同人眼可見內容。`layers: { groups: [] }` 為空群組陣列代表這個處理階段已執行，但這份 PDF 沒有選用內容群組；`layers` 欄位不存在則代表未要求 `--layers`。

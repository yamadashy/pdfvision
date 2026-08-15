---
title: "表單、連結與註解"
description: "--form-fields、--links 與 --annotations 的欄位結構：widget 類型與標籤、連結目標、註解旗標與標記幾何資訊。當 PDF 的可填寫欄位、可點擊目標或註解內容很重要時使用。"
sourceHash: c06a992b886a
---

<!-- Translated from docs/src/en/guide/interactive.md, which is generated from docs/cli-topics/interactive.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# 表單欄位、連結與註解

適用於 `-f json`、`-f xml` 與 `-f toon` 使用者的參考文件。

## 表單欄位（`--form-fields`）

```ts
interface FormField {
  name: string;              // PDF field name
  type: 'text' | 'checkbox' | 'radio' | 'choice' | 'signature' | 'button' | 'unknown';
  x: number; y: number; width: number; height: number;
  value?: string;            // current value when present
  checked?: boolean;         // checkbox/radio state when applicable
  readOnly?: boolean;
  required?: boolean;
  multiline?: boolean;
  displayValue?: string;      // viewer-visible selected choice label when different from value
  caption?: string;           // viewer-visible push-button caption when available
  exportValue?: string;       // checkbox/radio submitted value when pdf.js exposes it
  options?: FormFieldChoiceOption[]; // choice-field options when pdf.js exposes them
  combo?: boolean;            // true for combo boxes, false for list boxes
  multiSelect?: boolean;      // true when multiple choices can be selected
  flags?: PageAnnotationFlag[]; // decoded widget annotation flags: hidden, print, noView, locked, ...
  actions?: Record<string, string[]>; // widget-level JavaScript actions such as button scripts
  resetForm?: FormFieldResetFormAction; // non-JavaScript ResetForm button behavior
  label?: FormFieldLabel;    // nearby visible label, when the layout heuristic finds one
}

interface FormFieldChoiceOption {
  exportValue: string;        // submitted/exported form value
  displayValue: string;       // viewer-visible option label
}

interface FormFieldResetFormAction {
  fields: string[];            // field names listed by the ResetForm action
  include: boolean;            // true: reset only listed fields; false: reset all except listed fields
}

interface FormFieldLabel {
  text: string;
  relation: 'left' | 'right' | 'above' | 'below';
  x: number; y: number; width: number; height: number;
}
```

`formFields[]` 呈現 PDF 中互動式的 widget 註解：空白文字輸入框、核取方塊、單選按鈕、選項欄位、按鈕與簽名欄位。對政府或稅務表單來說特別有用，因為原生文字擷取能讀到標籤文字，卻讀不到人眼所見的可填寫欄位。核取方塊與單選 widget 在 pdf.js 有提供已送出值時，會包含 `exportValue`。選項欄位會把 `value` 保留為已送出／已匯出的選項，並在 viewer 可見的選取標籤與其不同時加上 `displayValue`；`options[]` 會列出所有已匯出與 viewer 可見的值，以及 pdf.js 有提供時的 `combo` / `multiSelect` 行為旗標。當 pdfvision 能從 widget 外觀特性中還原出 viewer 可見的 `/MK /CA` 標題時，按鈕會包含 `caption`；Markdown 會在 Value 欄顯示該標題，`--search` 也能以 `source: "formField"` 的形式回傳可見的按鈕標題比對結果。當選項欄位的 `displayValue` 與已送出的 `value` 不同時，Markdown 會在 Value 欄顯示 `displayValue`，在 Export 欄顯示 `value`。`flags[]` 解碼底層的 widget 註解旗標，讓代理即使在一般畫面渲染是空白的情況下，也能判斷表單值是隱藏、僅列印、不可見、鎖定，還是以其他方式受 viewer 狀態控制。`actions` 會在 pdf.js 有提供時，保留 widget 層級的 JavaScript 動作（例如按鈕點擊指令碼）；`resetForm` 則保留非 JavaScript 的 ResetForm 按鈕行為，讓代理能判斷某個按鈕是重設所有欄位、只重設列出的欄位，還是重設除列出欄位以外的所有欄位。Markdown 會為了可讀性縮短過長的 JavaScript 動作摘要；JSON、XML 與 TOON 則保留完整的結構化數值。`label` 是根據可見版面文字重建出的保守型最近行提示；核取方塊／單選 widget 偏好右側或左側同一行的標籤，文字輸入框則偏好緊鄰上方或左側的標籤。當相鄰的上下堆疊行組成同一個可見提示時，會被合併，因此狹窄欄位也可以帶有像「Employer identification number (EIN)」這樣的多行標籤，而不只是最接近的那一行。右側邊緣的核取方塊／單選提示可以保留在 widget 那一行結尾的換行說明文字，而點狀引導填充符與行號側欄會從這些提示標籤中移除；堆疊式核取方塊／單選選項行也會在遇到相鄰 widget 時停止，避免一個申報狀態選項吞掉下一個選項，而後續帶有自己行首前綴的注意事項／說明段落，不會被當作選項標籤的延續。左側的核取方塊／單選標籤，也可以合併緊鄰在前的延續行，因此像「check this box...」這樣的提示，能保留出現在上一行的鋪陳文字。狹窄的行內文字欄位也偏好同一行左側的說明標籤，這能讓短的稅務分類／代碼欄位保持與其前面的提示綁定，而不是與旁邊另一個欄位的鄰近標籤綁定，並會從這些提示標籤中修剪掉點狀引導填充符；高的多行文字欄位即使跨越較寬的表單間距，也能保留左側的簡短標籤。帶有點狀引導符號的右側邊緣金額欄位，可以把像「1 $」或「4(a) $」這種精簡標記，還原回可見的提示文字，包括標記行上方的簡短多行提示。細粒度的文字片段也會納入考量，避免重建出的版面行比人眼可見的欄位儲存格寬時，相鄰同一行的提示被同時併入兩個欄位。對於語意命名清楚的欄位，附近不相關的文字會被忽略，而不會被當作誤導性的標籤輸出；比起大範圍合併的整行，會優先選用與欄位名稱相符的較窄片段。座標採用與 `spans`、`layout.blocks` 與 `imageBoxes` 相同的未旋轉頁面檢視左上角座標系，因此 bbox 可以原封不動地傳入 `--render-region`。
## 連結（`--links`）

```ts
interface PageLink {
  type: 'url' | 'destination' | 'attachment';
  target: string | unknown[];  // URL, destination, or embedded attachment filename
  page?: number;               // 1-based physical target page when destination can be resolved
  text?: string;                // visible text inside the link rectangle when reconstructed
  unsafe?: boolean;             // true when pdf.js exposed only an unsafe URL fallback
  newWindow?: boolean;          // PDF requested opening the target in a new viewer window
  attachment?: {
    name: string;
    description?: string;
    size?: number;
    destination?: string | unknown[];
  };
  x: number; y: number; width: number; height: number;
}
```

`links[]` 呈現可點擊的 PDF 連結註解：外部 URL、引用跳轉、目錄目的地、附件跳轉，以及交叉參照目標。當 pdfvision 能把目標解析為以 1 為起始的實體頁碼時，內部目的地會包含 `page`。當 pdf.js 只暴露出不安全的 URL 後備值時，Launch／遠端跳轉動作仍會保留 `type: "url"` 以維持相容性，並加上 `unsafe: true`；當 PDF 要求 viewer 在獨立視窗開啟目標時，會保留 `newWindow`。內嵌的跳轉連結使用 `type: "attachment"`，並包含檔名、選填的描述、位元組大小與內嵌目的地中繼資料，但不會內嵌附件本身的位元組。`text` 是可以重建時，連結矩形內可見的原生文字；當寬廣的連結矩形橫跨一段很長的目錄區域時，會被截短為簡短標籤；當 PDF 把窄小的連結疊放在單一行內 token 上時，則會從周圍的行中裁切出來。座標採用與 `spans`、`layout.blocks` 與 `imageBoxes` 相同的未旋轉頁面檢視左上角座標系，因此 bbox 可以原封不動地傳入 `--render-region`。
## 註解（`--annotations`）

```ts
interface PageAnnotation {
  subtype: string;              // Text, Highlight, Underline, StrikeOut, FreeText, Stamp, FileAttachment, Ink, ...
  name?: string;                 // annotation/icon name such as Note, Comment, PushPin, Paperclip
  contents?: string;            // comment / markup contents
  title?: string;               // author/title label
  color?: [number, number, number];
  modified?: string;            // PDF date string
  hasAppearance?: boolean;
  flags?: PageAnnotationFlag[];  // decoded PDF annotation flags: hidden, print, noView, locked, ...
  fileAttachment?: {
    name: string;
    description?: string;
    size: number;               // byte length; bytes are never embedded in JSON/XML/TOON
  };
  x: number; y: number; width: number; height: number;
  border?: {
    width?: number;
    style?: string;             // solid, dashed, beveled, inset, underline, or raw pdf.js value
    dashArray?: number[];
  };
  line?: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    endings?: [string, string]; // PDF line ending names, e.g. None/OpenArrow
  };
  vertices?: { x: number; y: number }[];   // Polygon / PolyLine vertices
  inkPaths?: { x: number; y: number }[][]; // Ink annotation paths
  quadBoxes?: { x: number; y: number; width: number; height: number }[];
}

type PageAnnotationFlag =
  | 'invisible'
  | 'hidden'
  | 'print'
  | 'noZoom'
  | 'noRotate'
  | 'noView'
  | 'readOnly'
  | 'locked'
  | 'toggleNoView'
  | 'lockedContents';
```

`annotations[]` 呈現非連結、非 widget 的 PDF 註解：便利貼、註釋、螢光標示、底線、刪除線、圖章、自由文字、附件圖示、形狀標記、手繪墨跡，以及其他標記。當 pdf.js 有提供時，`name` 會保留 PDF 的註解／圖示名稱，例如 `Note`、`Comment`、`PushPin` 或 `Paperclip`。`flags[]` 解碼 PDF 的註解旗標，讓代理能分辨一般畫面可見的標記，與隱藏、僅列印、不可見、鎖定，或以其他方式受 viewer 狀態控制的註解；例如 `["hidden","print"]` 代表即使一般畫面渲染是空白的，該註解仍然存在於 PDF 中。當 pdf.js 有提供時，附件註解會包含檔名／描述／位元組大小等中繼資料，但絕不會在內容中內嵌檔案本身的位元組。當 pdf.js 有提供時，形狀註解會包含 `border`、`line`、`vertices` 或 `inkPaths`，讓代理能還原可見的端點、多邊形／折線幾何資訊，以及手繪墨跡路徑，而不只是外圍的 bbox。`Link`、`Widget` 與 `Popup` 註解會被刻意排除，因為連結與表單 widget 已有專屬輸出，而彈出視窗通常只是重複其父註解的內容。座標採用與 `spans`、`layout.blocks` 與 `imageBoxes` 相同的未旋轉頁面檢視左上角座標系；當 PDF 提供 QuadPoints 時，`quadBoxes[]` 會給出精確的標記區域。

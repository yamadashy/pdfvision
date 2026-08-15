---
title: "視覺區域與渲染"
description: "--image-boxes、--vector-boxes 與 --visual-regions 的資料結構，以及 --render-scale 與 --render-region 的作用。當需要挑選圖片、圖表、表格或表單區域進行渲染與視覺檢查時使用。"
sourceHash: b268aaef34d7
---

<!-- Translated from docs/src/en/guide/visual.md, which is generated from docs/cli-topics/visual.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# 視覺幾何與渲染

適用於 `-f json`、`-f xml` 與 `-f toon` 使用者的參考文件。

## 影像框（`--image-boxes`）

```ts
interface ImageBox {
  x: number; y: number; width: number; height: number;
}
```

每個繪製實例對應一筆項目——平鋪的主視覺影像會產生多筆項目。透過填色路徑繪製的含影像平鋪圖樣，會以繪製路徑的 bbox 呈現，因此遮罩／圖樣影像仍可作為裁切目標。要求 `--image-boxes` 時，每頁的 `imageCount === imageBoxes.length`；未要求時，`imageCount` 仍會回報數量，但不會出現 `imageBoxes`。Form XObject 的 CTM 追蹤可確保表單內繪製的影像落在正確的頁面座標位置。
## 向量框（`--vector-boxes`）

```ts
interface VectorBox {
  x: number; y: number; width: number; height: number;
}
```

當 pdf.js 回報路徑 bbox 時，每個已繪製的向量路徑對應一筆項目；當 pdf.js 提供目前的裁切 bbox 時，漸層填色也會納入，但會排除頁面大小的白色背景填色。這對地圖、符號表、圖表、圖示、漸層面板、表格線、表單框與投影片形狀很有用：這些是人眼可見、但既非原生文字也非點陣影像的內容。水平／垂直筆畫會在退化維度上擴展至至少 0.5 個原始頁面檢視單位，讓它們的框可以送入 `--render-region`。`vectorCount` 仍是代表有意義向量繪製操作的廣泛密度訊號；`vectorBoxes[]` 是可選的位置訊號，當底層操作沒有 bbox 時，可能會比 `vectorCount` 短。
## 視覺區域（`--visual-regions`）

```ts
interface VisualRegion {
  id?: string;              // stable page-local id, e.g. "p3-vr0", present in extracted PageResult
  kind: 'raster' | 'vector' | 'table' | 'form' | 'annotation' | 'mixed';
  x: number; y: number; width: number; height: number;
  areaRatio: number;        // region area / page area, rounded to 3dp
  sourceCount: number;      // total source geometry items represented
  sources: VisualRegionSource[]; // representative refs, capped for large vector clusters
  reason: string;           // short explanation for why this is worth inspecting
  associatedText?: VisualRegionAssociatedText[]; // nearby or in-region captions/form labels/panel titles/chart titles/table lead-ins/image labels/headings included in the region box
  image?: string;           // cropped PNG path, present iff --render-visual-regions rendered this region
  renderContentRatio?: number; // content ratio measured from the cropped PNG
  renderedContentBox?: { x: number; y: number; width: number; height: number }; // tight non-background pixel bbox in page coords, present iff --render-visual-regions measured visible crop content
}

interface VisualRegionSource {
  type: 'imageBox' | 'vectorBox' | 'layoutTable' | 'formField' | 'annotation';
  index: number;            // 0-based index into that page-level source collection, internal if not emitted
}

interface VisualRegionAssociatedText {
  text: string;
  relation: 'caption' | 'label';
  x: number; y: number; width: number; height: number;
  blockIndex?: number;      // 0-based index into layout.blocks[] for captions/headings/table lead-ins
  fieldIndex?: number;      // 0-based index into formFields[] for form labels
}
```

`visualRegions[]` 是為了模擬人類 PDF 視覺閱讀而設計的一層分派機制。它會把既有的幾何資訊，分組成加了留白、並限制在頁面範圍內的 bbox，涵蓋重要的點陣影像、緊湊的點陣文字條、向量繪圖群集、`layout.tables[]` 提示、表單欄位群集，以及可見的註解標記，例如螢光標示、圖章、手繪墨跡與形狀註解。當偵測到附近的圖說或表單標籤（`Figure`、`Table`、`Plate`、`図`、`表`、`図表`）時，`associatedText[]` 會記錄該文字，且裁切 bbox 會擴大以納入附近文字，使渲染出的裁切圖能一併呈現人類可見的說明，而不只是原始的圖片／widget 矩形；比對圖說的行會優先於其所在的整個版面區塊，避免表格標題或圖說下方的段落文字變成誤導性的關聯文字；而本地圖說關聯只會保留附近最佳的圖說群組，避免相鄰表格的圖說被錯誤附加到下方的圖片裁切上。視覺區域內像 `Fig.4` 這種單獨或極小的參照文字，除非同一段文字也以可讀大小帶有描述性的圖說用詞，否則不會被視為圖說。點陣影像裁切也可以附加緊接在下方的簡短純文字標籤（例如投影片影像的圖說），同時會過濾版權／授權聲明。大型點陣與混合型視覺區域可以在區域頂部附加簡短的非標題型圖表標題；大型未標記的區域也可以附加附近未重複的標題，或區域頂部內的標題，以 `relation: "label"` 的形式呈現，讓圖表、表單／表格背板與心電圖式面板能保留人類用來辨識它們的可見標題。附近以字母標記的面板標題，例如 `(a) ...`，也可以附加為標籤，並向上擴大圖表／地圖／面板裁切範圍，即使該區域已經內嵌了標籤也一樣。當可見的表格本身沒有圖說時，表格區域也可以附加簡短的純文字引言，例如「The following table...」或「... as follows:」。頁面層級的 `Plate` 圖說可以作為中繼資料附加到較遠的面板裁切上，而不需要讓每個裁切都擴大以納入圖說區塊，這樣可以讓多面板地圖／圖片裁切保持局部性，同時保留共用的圖說內容；以 `A,B:` 與 `C,D:` 這類線索明確列舉面板的圖說，也可以把不相連的向量圖表片段群組成一個裁切，並納入完整的圖說區塊。當有多頁證據可用時，重複出現的頁首／頁尾文字會被排除在圖說關聯之外。當存在更具體的前景框或密集的向量網格結構時，頁面大小的點陣／向量框會被視為背景，包括覆蓋在整頁點陣背景上的密集細向量網格；橫跨多個大型點陣面板的大範圍純向量背板也會被抑制，讓面板層級的裁切仍然可用；這可避免投影片背景圖、整頁設計圖層與 CAD／繪圖背板吞掉實際的圖表／表格／圖面區域。如果整頁封面或掃描件是主要的視覺證據，只有小型 logo、邊緣裝飾元素或低信心度的 OCR 片段表格提示與其競爭，仍會輸出整頁點陣影像，旋轉過的掃描頁也一樣。當整頁渲染證據將該頁分類為空白時，視覺區域會被抑制，避免空白頁面以及不可見的表單欄位或註解成為視覺模型的分派目標。頁面邊緣的窄幅裝飾元素會被抑制，避免邊緣色條、側邊 URL、浮水印、與頁首／頁尾線對齊的小型點陣 logo／文字條，以及頁首／頁尾區帶成為視覺模型的分派目標。向量密集的頁面會從細長的向量線框取得備援的群集區域，因此即使個別線框太細而無法用一般方式群集，各自獨立的類表格網格仍能各自產生獨立的裁切圖。密集的小型向量標記欄位也可以產生密集的視覺區域裁切，並依不相連的標記群集切分，這能捕捉散點／大量圓點的生醫圖片、地圖，以及面板文字或標籤內嵌在向量圖形中（而非可擷取文字）的標記欄位，且不會把不相關的區域強行合併成一張整頁裁切圖。淺矮、橫跨整頁的兩列版面表格提示，以及欄數極端的兩列表格提示，都會被抑制而不作為視覺區域的種子，因為它們往往來自圖表刻度、OCR 片段或不相關的面板，而非人類可讀的表格裁切。欄位密集的表單頁面會把互動欄位切分成區段／列大小的裁切圖，抑制原本會與表單區段重複的大型或被包含的純向量表單背板，在作為視覺區域種子時略過隱藏／不可見／noView 的表單欄位與註解（但在要求相應擷取時，仍會保留在 `formFields[]` / `annotations[]` 中），略過沒有外觀串流的 FreeText 註解作為裁切種子（但保留其註解中繼資料與搜尋比對結果），在表單欄位 bbox 已提供實際頁面位置時略過未定位的 widget 外觀向量框，並在留白讓裁切可讀時保留細窄的核取方塊列或標記列。代理可以直接把一個區域餵給 `--render-region <x,y,width,height>`，以視覺方式檢查圖片／圖表／表格／表單／註解，而不需要先自行群集原始的 `imageBoxes[]`、數百個 `vectorBoxes[]` 或註解 bbox。區域座標維持與 `imageBoxes[]` / `layout.blocks[]` 相同的頁面檢視左上角座標系；在旋轉過的頁面上，pdfvision 會透過旋轉後的 pdf.js viewport 對應裁切範圍，讓輸出的 PNG 遵循人類可見的頁面方向。`--render-visual-regions` 省去手動的第二次呼叫，直接把每個建議的裁切渲染到 `visualRegions[].image` 中；它也會附加 `renderContentRatio`，而當非背景像素所占面積比來源幾何裁切更緊湊時，會在同一頁面座標系中附加 `renderedContentBox`。它隱含了 `--visual-regions`，但不需要整頁的 `--render`。`sourceCount` 是所代表的來源項目總數；`sources[]` 有上限，以維持向量密集頁面的資料精簡。

在純向量且無文字的頁面上，當該向量框是唯一非空白的視覺證據時，會輸出一個頁面大小的向量框，讓以路徑繪製的符號表與純向量圖示仍能產生可供裁切的區域。
## 渲染：`--render-scale` 與 `--render-region`

這兩個旗標只有在 `--render`（或內部會進行點陣化的 `--ocr`）開啟時才有作用。

- **`--render-scale <n>`**：點陣化的縮放倍率。預設為 `2`（約 144 DPI）。範圍為 `(0, 4]`。數值越小，視覺模型的資料量越小；數值越大，能擷取的細節越多。
- **`--render-region <x,y,w,h>`**：以與 `imageBoxes` / `layout.blocks` 相同的原始未旋轉頁面檢視左上角座標系，渲染頁面中的一個子矩形；bbox 會原封不動地傳入。像素尺寸等於原始區域 × UserUnit × 渲染倍率。旋轉過的頁面因為裁切範圍是透過人類可見的 viewport 對應，輸出的像素寬高可能會互換。它只能用於單一頁面，並會拒絕超出邊界的區域。這組數值會出現在快取鍵與檔名中，也會在 `PageResult.renderRegion` 中回顯。
- **`--render-visual-regions`**：渲染每一個 `visualRegions[]` 裁切，並在每個區域上附加 `image` / `renderContentRatio`。當渲染出的裁切包含可量測的非背景像素時，`renderedContentBox` 會以頁面座標提供更緊湊的渲染像素 bbox，同時保留來源幾何區域不變。偵測到時，區域框會納入相關聯的圖說／表單標籤、附近的面板標題、簡短的表格引言、簡短的影像標籤，以及附近的標題，因此裁切結果通常更接近人類在請視覺模型讀取之前會自行挑選的範圍。它使用與整頁 `--render` 相同的輸出目錄、`--render-scale`、快取影像驗證與安全的每份 PDF 子目錄規則，但除非同時要求了 `--render`，否則 `pages[].image` 會維持缺席。

典型的代理流程：先用 `--layout` 擷取，在 `layout.blocks[i]` 中找出可疑的區塊（或從 `warnings[i].blockIndex` 取得其索引），再用 `blocks[i]` 的 bbox，以 `--pages <N> --render --render-region <x,y,w,h>` 重新執行以放大檢視。

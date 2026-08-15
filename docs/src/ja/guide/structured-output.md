---
title: "構造化出力"
description: "トップレベルの DocumentResult、ページごとの PageOverview と PageResult のフィールド、PageQuality、すべての bbox が使う座標系について説明します。-f json / -f toon / processDocument() の出力をプログラムから扱う際に参照してください。"
sourceHash: c44996363b15
---

<!-- Translated from docs/src/en/guide/structured-output.md, which is generated from docs/cli-topics/schema.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# 構造化出力スキーマ

`-f json`、`-f xml`、`-f toon` を利用する側のリファレンスです。エージェントやツールが構造化されたペイロードをプログラムから消費し、すべてのフィールド、その形状、座標系の規約を知る必要があるときに参照してください。

以下の JSON 形式のフィールドパスは、`-f json`、デコード後の `-f toon`、`processDocument()` において厳密に一致します。`-f xml` は表示用の投影であり、一部のフィールドをリネーム・フラット化し（`page` → `no`、`pageLabel` → `label`、`quality.*` → ページ属性）、空フィールドの有無も異なることがあります。`-f markdown` は意図的にフィールドを変換または省略します。各フォーマットの契約は [`pdfvision docs formats`](./output.md) に、エクスポートされる TypeScript の型名は [`pdfvision docs library`](./library-api.md) に一覧があります。

暗号化された PDF では、pdf.js が文書パスワードを要求する場合、`--password <value>`、`--password-stdin`、または `processDocument(..., { password })` が必要です。パスワードは復号にのみ使われ、JSON/XML/TOON/Markdown に出力されることはありません。argv やシェル履歴への露出が問題になる CLI ワークフローでは `--password-stdin` を優先してください。`--password` は、stdin が空のときの明示的なフォールバックとして指定できます。

## DocumentResult（トップレベル）

```ts
interface DocumentResult {
  file: string;                // path/URL the CLI was invoked with
  totalPages: number;          // total in the source PDF, not in the selection
  metadata: DocumentMetadata;  // title / author / subject / creator (all string | null)
  pageLabels?: string[];       // full 0-indexed viewer page-label array; present iff --page-labels
  attachments?: DocumentAttachment[]; // embedded file metadata; present iff --attachments
  attachmentCount?: number;    // document-level embedded files; always computed, omitted when zero
  javascriptActionCount?: number; // document-level JavaScript scripts; always computed, omitted when zero
  outlineCount?: number;       // top-level outline entries; always computed, omitted when zero
  xfa?: boolean;               // true iff the PDF declares an XFA (LiveCycle) form; see xfa_form warning
  outline?: DocumentOutlineItem[]; // document bookmarks; present iff --outline
  viewer?: DocumentViewerState; // viewer settings; present iff --viewer
  layers?: DocumentLayers;       // optional content groups; present iff --layers
  overview?: PageOverview[];   // per-page density summary; present iff pages.length > 1
  pages: PageResult[];         // one entry per selected page, in page-number order
}
```

`file` はキャッシュヒット時、今回の呼び出しのパスまたは `--remote` の URL に書き換えられます。そのため、キャッシュされたエントリが同じコンテンツハッシュに触れた別の呼び出しから来たものであっても、利用側は意味のある入力ラベルを見ることができます。

`javascriptActionCount` は常時有効な存在シグナルです。JavaScript カタログの `OpenAction` エントリと名前付き JavaScript エントリを含め、pdf.js が文書レベルで返すスクリプトエントリの数を数えます。`--viewer` を渡すと、それらの名前とスクリプトソースが `viewer.jsActions` に公開されます。pdfvision はスクリプトをデータとして報告するだけで、実行はしません。
## PageOverview（密度サマリー）

```ts
interface PageOverview {
  page: number;
  pageLabel?: string;             // viewer-visible page label; present iff --page-labels and labels exist
  charCount: number;
  imageCount: number;             // raster image draws (XObject + inline + mask + image-bearing patterns), per drawn instance
  vectorCount: number;            // vector drawing ops (paths / shadings), e.g. form boxes, chart rules, slide shapes
  textCoverage: number;           // 0..1, fraction of page area covered by text glyph bboxes
  nonPrintableRatio: number;      // 0..1, pre-C0-strip NUL / control / noncharacter fraction
  nonPrintableCount: number;      // raw count — stays discriminable when the 3dp ratio rounds to 0
  renderContentRatio?: number;    // 0..1, fraction of pixels differing from the page's dominant background (present iff --render or --ocr)
  rotation?: number;               // clockwise page rotation in degrees; present only for rotated pages
  userUnit?: number;               // PDF /UserUnit; omitted when 1; physical points = raw page-view value * userUnit
  quality: PageQuality;           // derived classification — see below
  warningCount?: number;          // mirror of pages[N].warnings.length, omitted when no rule fired
  matchCount?: number;            // mirror of pages[N].matches.length; present-with-0 means "search ran, no hit"
  vectorBoxCount?: number;        // mirror of pages[N].vectorBoxes.length; present iff --vector-boxes
  visualRegionCount?: number;     // mirror of pages[N].visualRegions.length; present iff --visual-regions
  formFieldCount?: number;        // furniture presence count; automatic when non-zero, present-with-0 when the matching flag ran
  linkCount?: number;             // furniture presence count; automatic when non-zero, present-with-0 when the matching flag ran
  annotationCount?: number;       // furniture presence count; automatic when non-zero, present-with-0 when the matching flag ran
  structureNodeCount?: number;    // count of tagged-PDF structure nodes; present iff --structure
  width: number;                  // raw unrotated page-view units
  height: number;
}
```

`overview[]` は、サイレント障害を検出するために最初に確認すべきものです。`quality` フィールドは一発の分類を与えますが、以下の生シグナルを使えば、エージェントは独自にシグナルを組み合わせられます。

- `imageCount > 0 && textCoverage ≈ 0` → 画像化されたページ。テキストストリームは空です。
- `imageCount > 0 || vectorCount > 0` に加えて `textCoverage` が非常に低く `charCount` も小さい → 表示されているページのほとんどがネイティブテキストの外にある（多くの場合、スライドや画像の上にページ番号があるだけ）。`quality.nativeTextStatus === 'sparse_text_with_visual_content'` に対応します。
- `charCount` が非常に小さく、ベクター構造が密なページも、`textCoverage` が低くない場合でも `sparse_text_with_visual_content` になり得ます。1 つの大きな透かしテキストアイテムがページの大部分を覆う一方で、表示されているフォーム・表・チャートの内容はベクターに存在するためです。
- ネイティブテキストが存在し、かつ `quality.visualStatus === 'blank'` → ラスタライズされたページ上でネイティブテキストが視認できません。よくあるケースは、隠された OCR の残留物、不可視/壊れたフォントのテキスト、またはレンダリングとテキストレイヤーの不一致です。`quality.nativeTextStatus === 'sparse_text_on_blank_visual'` に対応します。
- `vectorCount > 0 && textCoverage is low` → `imageCount` がゼロでも、視認できる非ラスター構造が存在します。フォーム、チャート、ダイアグラム、スライド図形には `--render` が必要な場合があります。
- `0.05 <= nonPrintableRatio < 0.3` → 1 つ以上のフォントに使用可能な ToUnicode CMap がなく、ネイティブテキストには読める断片と生のグリフインデックスが混在します。一部の単語が使えそうに見えても、ネイティブテキストは不完全です。`quality.nativeTextStatus === 'mixed_glyph_indices'` に対応します。
- `nonPrintableRatio >= 0.3` → ページのほとんどで ToUnicode CMap が欠落しており、`textCoverage` は問題なく見えても、テキストストリームの大半が生のグリフインデックス（NUL + 制御文字）です。ネイティブテキストは使用不能なので、`--render` または `--ocr` にフォールバックしてください。`quality.nativeTextStatus === 'unusable_glyph_indices'` に対応します。
- 正規化された `pages[].text` は、タブ・改行・キャリッジリターンを除く非表示の C0 制御文字を除去しますが、`nonPrintableRatio` と `nonPrintableCount` は除去前のテキストシグナルを引き続き使うため、まばらな制御バイトの根拠も可視のまま残ります。
- Private Use Area のグリフコード文字列は、意図的に `nonPrintableRatio` から除外されています。アイコンフォントが正当に PUA を使うことがあるためです。ページのテキストが PUA 主体の場合、`quality.nativeTextStatus === 'ok'` かつ `nonPrintableRatio === 0` であっても `pages[].warnings[].code === 'glyph_garbage_text'` が発火します。それ以外は読めるテキストの中に PUA のグリフが繰り返し現れる場合は、`localized_glyph_noise` が発火するため、数式やカスタム記号の連続をレンダリングと突き合わせて確認できます。
- `quality.visualStatus === 'sparse'` → ラスタライズされたページは空白ではないものの、視認できるマークがまばらです。これは `0.001 < renderContentRatio <= 0.005`、裏付けのあるごく小さな画像/ベクター/注釈の痕跡が空白しきい値未満である場合、および可視のインクがわずかにあり空白しきい値未満のテキストのみ・注釈のみのページを含みます。レンダリング失敗と判断する前に、geometry を確認するかクロップをレンダリングしてください。
- `quality.visualStatus === 'blank'` → ラスタライズされたページは、自身の支配的な背景色に対して実質的に空白です（`--render` または `--ocr` が有効なときのみ意味を持ちます）。背景を考慮するため、暗い表紙やベージュ色のスキャンで誤検知しません。これは、pdfvision が他に表面化できないレンダリングパイプラインの失敗を捉えます。具体的には、pdf.js + @napi-rs/canvas が JPEG2000 の画像ストリーム（Internet Archive のスキャンによくある）をデコードできない場合や、解決可能なグリフを持たないフォントの PDF が何も描画しない場合です。この状態に対して OCR を実行すると、`confidence: 0` は OCR の見落としでは*ありません* — 入力がほぼ均一な画像だったということです。
## PageResult（ページごと）

```ts
interface PageResult {
  page: number;
  pageLabel?: string;           // viewer-visible label such as i, ii, A-1, 1; present iff --page-labels and labels exist
  text: string;                  // NFKC-normalized and C0-cleaned unless --no-normalize
  rawText?: string;              // pre-normalization text — present when normalization changed it
  charCount: number;
  imageCount: number;
  vectorCount: number;
  textCoverage: number;
  nonPrintableRatio: number;     // pre-C0-strip NUL / control / noncharacter ratio
  nonPrintableCount: number;     // pre-C0-strip raw count alongside the ratio
  renderContentRatio?: number;   // pixel fraction differing from the page's dominant background (present iff --render or --ocr)
  quality: PageQuality;          // derived per-page classification — agent-side dispatch lives on this field
  rotation?: number;              // clockwise page rotation in degrees; present only for rotated pages
  userUnit?: number;              // PDF /UserUnit; omitted when 1; mirrored in overview[]
  width: number;
  height: number;
  image?: string;                // absolute PNG path — present iff --render
  renderRegion?: { x, y, width, height }; // echoed back when --render-region was set; lets consumers tell crop vs full
  spans?: TextSpan[];            // present iff --geometry
  layout?: PageLayout;           // present iff --layout
  imageBoxes?: ImageBox[];       // present iff --image-boxes
  vectorBoxes?: VectorBox[];     // present iff --vector-boxes
  visualRegions?: VisualRegion[]; // present iff --visual-regions
  formFieldCount?: number;       // always computed; omitted when zero
  formFields?: FormField[];      // present iff --form-fields
  linkCount?: number;            // always computed; omitted when zero
  links?: PageLink[];            // present iff --links
  annotationCount?: number;      // always computed; omitted when zero
  annotations?: PageAnnotation[]; // present iff --annotations
  structure?: PageStructureNode | null; // present iff --structure; null means no page structure tree
  structureTables?: PageStructureTable[]; // tagged tables; present iff --structure found Table nodes
  jsActions?: Record<string, string[]>; // page-level JavaScript actions, present iff --viewer and the page defines them
  ocr?: PageOcr;                 // present iff --ocr
  warnings?: PageWarning[];      // omitted when no rule fired on the page
  matches?: SearchMatch[];       // present iff --search; empty array means "search ran, no hit on this page"
}

interface PageQuality {
  nativeTextStatus:
    | 'ok'                       // usable native text that is not sparse relative to non-text visuals
    | 'mixed_glyph_indices'      // 0.05 <= nonPrintableRatio < 0.3 — readable fragments mixed with glyph garbage
    | 'unusable_glyph_indices'   // nonPrintableRatio >= 0.3 — fall back to --ocr / --render
    | 'sparse_text_on_blank_visual' // native text exists but the rendered page is effectively blank
    | 'sparse_text_with_visual_content' // native text exists but is too sparse for a visual page
    | 'empty_but_visual_content' // no native text but the page has images / vectors / non-blank pixels / visible annotations not contradicted by a blank render
    | 'empty';                   // no text, no detected visual content
  visualStatus?:                 // present iff --render or --ocr triggered a raster
    | 'ok'                       // renderContentRatio > 0.005 — renderer drew clearly populated content
    | 'sparse'                   // sparse marks: 0.001 < ratio <= 0.005, or corroborated tiny visual traces
    | 'blank';                   // effectively blank against the page's own background
}
```

`text` は pdfjs 由来のテキストストリームです。生のテキストアイテムは、[`pdfvision docs layout`](./layout.md) の契約に基づいて正規化の前に重複排除されるため、optional content や overprint による重複が繰り返し語として読めることはありません。検出された本文サイズの日本語縦書きカラムは、そのカラムの上から下への並び順とソースストリームの並び順が一致する場合、ソースストリーム順に結合されます。並びが食い違う連続部分があれば、その部分だけが生アイテムの結合にフォールバックします。縦書き日本語カラム内のインラインの縦中横数字グループ（`10` など）は、ソースストリームの並びが geometry と一致する場合、カラムテキスト内に保持されます。日本語・中国語のふりがな付きページでは、pdfvision が小さいかな文字や pinyin 形式の連続を曖昧さのない CJK 基底範囲に対応付けられる場合、ふりがな/ルビが `base《ruby》` としてインラインで付与されます。これには隣接する半角縦書きルビカラム、横書き基底テキスト上の小さいかな、横書き CJK 基底テキスト上の pinyin 形式のラテン文字読みが含まれます。曖昧または対応付けできないルビは除外されたままとなり、検索はルビを含む行とルビを除いた行の両方を使うため、基底語での検索も引き続きヒットします。縦書き本文カラムの右側の gutter にある短い中サイズの注参照マークも、再構成されたテキスト/レイアウトからは除外されますが、`--geometry` は元のソーステキストアイテムの span を引き続き公開します。`rawText` は、存在する場合、JSON および正常な TOON 出力では厳密に対応する兄弟フィールドとして、XML では兄弟の `<rawText>` 要素として（XML で禁止されているコード単位はドキュメント化されたマーカーで表現されます）出力され、Markdown では省略されます。`ocr.text`（`--ocr` が有効な場合）は並行する OCR の結果であり、**`text` を上書きすることは決してありません** — 利用側が差分を取るか、そのページにとってより良く見えるシグナルを選びます。

`quality` は純粋な観測結果であり、推奨ではありません。pdfvision はエージェントに見えたものを伝え、次に何をするかはエージェントが選びます。

機能ごとのペイロードはオプトインです。そのため、`--layout --form-fields` を渡した結果はこれらのフラグを渡さなかった結果と形状が異なります。自動なのは上記の furniture の存在カウントだけです。実行されて何も見つからなかったフラグでも、そのフィールドは出力されます。`--form-fields`、`--links`、`--annotations`、`--search` は項目のないページで `[]` を生成し、`--structure` は `null` を生成します。これにより、利用側は「要求されなかった」のか「要求されたが存在しなかった」のかを区別できます。

## 座標系

すべての座標（span、レイアウトブロック、画像ボックス、ベクターボックス、視覚領域、フォームフィールド、`renderRegion`）は、回転前の pdf.js `page.view` の可視ボックスの生の単位を使い、`(0, 0)` はその左上、`y` は下方向に増加します。このボックスは、明確に有効な CropBox が適用される場合は CropBox ∩ MediaBox、そうでなければ MediaBox です。`pages[].userUnit` と `overview[].userUnit` は、デフォルトでない PDF の `/UserUnit` を公開し、値が 1 のときは省略されます。物理ポイント = 生のページビュー値 × UserUnit。レンダリングされたピクセル = 回転による軸の入れ替え前の、生の領域 × UserUnit × render scale です。`pages[].width` / `height` と `renderRegion` の境界は可視ボックスを基準とした生の値で、同じ bbox がそのまま `--render-region` に渡せます。JSON、デコード後の TOON、ライブラリでは、`pages[].rotation` と `overview[].rotation` に時計回りの回転が保持されます。XML はページ結果の回転を `<pages><page rotation="...">` に保持しますが、現時点では overview の回転は省略します。

警告検出器のしきい値と `pt` / `pt²` のメッセージは、既に抽出された geometry の非公開の物理ポイントビューを使いますが、公開される bbox は生の値のままです。これによって抽出パイプライン全体が物理的に不変になるわけではありません。レイアウトのグルーピング、フォームラベルの再構成、ベクターボックスの整形、視覚領域の生成には依然として生単位のヒューリスティックが含まれており、物理的に等価であってもデフォルトでない UserUnit を持つ PDF に対しては異なる上流シグナルを生成し得ます。

回転前のページ座標を、回転前のフルページ PNG にマッピングするには次のようにします。

```ts
const sx = image.width / page.width;
const sy = image.height / page.height;
const pixelBox = { x: box.x * sx, y: box.y * sy, width: box.width * sx, height: box.height * sy };
```

この直接スケーリングは回転していないページで有効です。回転しているページでは、フルページ PNG の width/height が `page.width` / `page.height` に対して入れ替わっていることがあるため、`pages[].rotation` と PDF のビューポート変換（または `--render-region`）を使ってください。

座標を持つすべてのフィールド — span、レイアウトブロックと行、画像ボックス、ベクターボックス、視覚領域、フォームフィールド、リンクと注釈のボックス、structure ノードの bbox、OCR の単語、検索の一致 — はこの 1 つの座標系を使うため、構造化されたフィールドから視覚的なクロップへ移るときに、別の座標系を新たに考える必要はありません。

## タスク別フィールド一覧

どのフィールドがどの疑問に答えるか、そしてそれを詳しく扱うトピックです。

- テキストの読み取り — `pages[].text`、`rawText`、`quality`、`warnings[]`（[`pdfvision docs warnings`](./warnings.md)）。
- レイアウトに依存する読み取り — `layout.blocks[]`、`layout.blocks[].lines[]`、`layout.tables[]`、`spans[]`（[`pdfvision docs layout`](./layout.md)）。
- 視覚的な確認 — `image`、`renderContentRatio`、`imageBoxes[]`、`vectorBoxes[]`、`visualRegions[]`（[`pdfvision docs visual`](./visual.md)）。
- スキャンの復元 — `ocr.text`、`ocr.confidence`、`ocr.words`、`quality.visualStatus`（[`pdfvision docs ocr`](./ocr.md)）。
- 根拠検索 — `matches[].source`、`matches[].bbox`、`matches[].context`（[`pdfvision docs search`](./search-and-region-zoom.md)）。
- フォーム分析 — `formFields[]`: `value`、`checked`、`flags`、`actions`、`label`、およびウィジェットの bbox（[`pdfvision docs interactive`](./interactive.md)）。
- ナビゲーションと文書機能 — `pageLabels`、`outline`、`links[]`、`viewer`、`layers`、`structure`（[`pdfvision docs document-features`](./document-features.md)）。
- ファイル一覧 — `attachments[]` のメタデータ、および `--attachment-output` がバイト列を書き出した後の `attachments[].path`（[`pdfvision docs document-features`](./document-features.md)）。

結論がこれらのいずれかに基づく場合は、それを導いたページ番号と bbox を保持しておいてください。その組が、後続の `--render-region` クロップで根拠を示すために必要なものです。

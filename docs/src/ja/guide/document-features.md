---
title: "文書機能"
description: "文書レベルの出力形状: --structure のタグ付きツリーと表、--page-labels、--attachments、--outline、--viewer の状態、--layers。ナビゲーション、アクセシビリティタグ、埋め込みファイル、optional content が関わるときに参照してください。"
sourceHash: d215b9d959bd
---

<!-- Translated from docs/src/en/guide/document-features.md, which is generated from docs/cli-topics/document-features.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# 文書レベルの機能

`-f json`、`-f xml`、`-f toon` を利用する側向けのリファレンスです。

## 構造 (`--structure`)

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

`pages[].structure` は、人間の読者が PDF viewer のアクセシビリティレイヤーを通じて到達できるタグ付き PDF の構造ツリーを公開します。これは特に、アクセシブルな政府系 PDF、マニュアル、レポート、フォームで有用です。こうした文書では、図の `alt` テキストがネイティブテキスト抽出よりも視覚的な領域をよく表していることがあります。たとえば IRS の記入案内書では、ネイティブテキストストリームには断片しか並んでいなくても、表紙の図の完全な人手記述を `alt` 経由で得られる場合があります。構造の `bbox` 値は、`spans`、`layout.blocks`、`imageBoxes` と同じ、回転前のページビュー top-left 座標系で `[x, y, width, height]` を使います。構造文字列中の迷い込んだ制御バイトは出力前に取り除かれるため、壊れた `alt` / `lang` 値が JSON、XML、Markdown、TOON に NUL バイトとして漏れることはありません。`structure: null` は、このパスが実行され pdf.js がページ構造ツリーを見つけられなかったことを意味します。`structure` フィールド自体が無い場合は、`--structure` が要求されなかったことを意味します。`overview[].structureNodeCount` は構造ノード数を反映するため、複数ページを扱う側は各ツリーを走査せずにタグ付きページを見つけられます。

`pages[].structureTables` は、すでに読み込まれているテキストストリームの marked-content id と構造コンテンツ id を突き合わせることで `Table` ロールを再構成します。`THead` / `TBody` / `TFoot` のラッパーと、直接の `TR` 子要素の両方をサポートします。`TBody` 内の `TH` は行ヘッダーとして扱われ、それ以外のラップされた `TH` セルは列ヘッダーとして扱われます。ラップされていない行では、最初の行がすべて `TH` である場合を除き、`TH` セルは行ヘッダーとして扱われます(この場合はその行が列ヘッダーとして分類されます)。空のタグ付きセルは空文字列のままです。セル内の段落は `<br>` で連結され、ネストされた表は親セルのテキストにフラット化されます。pdf.js は表のスパンや明示的な `/Scope` を公開しないため、`RowSpan` / `ColSpan` は表現できず、ヘッダーの方向はヒューリスティックに判定されます。ページをまたぐ表は結合されません。このフィールドはタグ付きの `Table` が存在しない場合には現れません。ジオメトリから導出される `layout.tables[]` とは独立しているため、`--layout` と `--structure` の両方を要求すると、同じ目に見える表が 2 回表示されることがあります。
## ページラベル (`--page-labels`)

`pageLabels[]` は、元の PDF が持つ viewer 用ページラベル配列全体で、物理ページ 1 を配列インデックス 0 として並びます。`pages[].pageLabel` と `overview[].pageLabel` は、PDF がラベルを定義している場合に、選択したページのエントリを反映します。PDF viewer が前付けを `i`、`ii`、... と表示し、本文の番号付けを `1` から再スタートする場合や、セクションが `A-1` のような接頭辞を使う場合に活用してください。CLI のページ選択には引き続き物理ページ番号を使いますが、`pageLabel` はエージェントに、人間が viewer の chrome 上で何を見ているかを伝えます。
## 添付ファイル (`--attachments`)

```ts
interface DocumentAttachment {
  name: string;          // decoded filename shown by the PDF viewer
  rawName?: string;      // raw PDF filename when it differs from name
  description?: string;  // file-spec description when present
  size: number;          // embedded file byte length
  path?: string;          // saved path, present when --attachment-output was provided
}
```

`attachments[]` は、人間の PDF viewer が添付ファイルペインやページ上のファイル添付アイコンとして公開している埋め込みファイル添付を表示します。添付ファイルのバイト列は意図的に JSON/XML/Markdown/TOON 出力に含めていません。任意のバイナリコンテンツでエージェントのコンテキストを埋め尽くすことなく、PDF に補足資料が含まれているというシグナルとしてメタデータを使ってください。エージェントが実ファイルをディスク上に必要とする場合は、`--attachments` と一緒に `--attachment-output <dir>` を渡してください。pdfvision は PDF ごとのフィンガープリントサブディレクトリ配下にファイルを書き込み、`attachments[].path` を埋めます。
## アウトライン (`--outline`)

```ts
interface DocumentOutlineItem {
  title: string;
  type?: 'destination' | 'url' | 'action';
  target?: string;              // named/internal destination, explicit-destination JSON, URL, or action name
  page?: number;                // 1-based, resolved when pdf.js can map the destination
  items?: DocumentOutlineItem[];
}
```

`outline[]` は、人間の PDF viewer のサイドバーに表示される文書アウトライン/しおりを表示します。ネストを保持し、外部 URL、`NextPage` のような名前付き viewer アクションも扱い、可能な場合は名前付き/明示的な PDF destination を 1-based のページ番号に解決します。空の `outline: []` は、このパスが実行され PDF にアウトラインが無かったことを意味します。`outline` フィールド自体が無い場合は、`--outline` が要求されなかったことを意味します。
## Viewer の状態 (`--viewer`)

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

`viewer` は、人間の PDF viewer がページテキストを読む前に使う文書レベルの状態を表示します。サイドバー/ページモード、ページレイアウト、`DisplayDocTitle` のような preference、カタログの `OpenAction`、自動印刷スクリプトのような文書 JavaScript action、権限フラグ、タグ付き PDF の `MarkInfo` が含まれます。文書 JavaScript の有無は `javascriptActionCount` で常に取得できます。`--viewer` はそれをアクション名とスクリプトソースとして `viewer.jsActions` に展開します。同じ `--viewer` パスは、ページが定義していれば `PageOpen` / `PageClose` のようなページレベルの JavaScript action も `pages[].jsActions` として出力します。Markdown は非常に長い JavaScript action のサマリーを読みやすさのために短縮しますが、JSON、XML、TOON は完全な構造化された値を保持します。開始位置、しおり/サイドバーのモード、JavaScript がトリガーする viewer の振る舞い、コピー/印刷権限、タグ付き PDF の構造がナビゲーションやアクセシビリティに影響する、仕様書、マニュアル、論文、フォーム、長いレポートで使ってください。空の `viewer: {}` は、このパスが実行され viewer レベルの設定が存在しなかったことを意味します。`viewer` フィールド自体が無い場合は、`--viewer` が要求されなかったことを意味します。
## レイヤー (`--layers`)

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

`layers` は、PDF の optional content group を表示します。これは、地図、CAD/デザインファイル、多言語バリアント、オーバーレイの多い文書に対して、人間の PDF viewer が公開できるレイヤーパネルです。表示されるコンテンツがトグルされたレイヤーに依存しうる場合や、地図/デザインのページがテキスト・ベクター・画像だけでは不完全に見える場合に使ってください。`groups[].visible` は、文書の既定の optional content 設定が適用された後の pdf.js の display-intent の可視性を反映します。pdf.js のテキスト抽出は、既定の viewer 状態では非表示になっているグループの optional content マークテキストを含むことがあります。`pages[].warnings[].code === "optional_content_text_may_include_hidden_layers"` のときは、テキストが人間に見えているものと厳密に一致すると見なす前に、`pages[].text` を `--render` の結果と比較し、`--layers` を確認してください。空の `layers: { groups: [] }` は、このパスが実行され PDF に optional content group が無かったことを意味します。`layers` フィールド自体が無い場合は、`--layers` が要求されなかったことを意味します。

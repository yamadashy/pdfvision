---
title: "レイアウトとジオメトリ"
description: "`--layout` の block / line / table 形状、複数段の読み順、繰り返し要素（chrome）、見出しレベル、`--geometry` の span 契約について説明します。フラットなテキストではなく、構造や読み順を復元したいときに使います。"
sourceHash: d1f8f8095566
---

<!-- Translated from docs/src/en/guide/layout.md, which is generated from docs/cli-topics/layout.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# レイアウトと span のジオメトリ

`-f json`、`-f xml`、`-f toon` を使う場合のリファレンスです。

## レイアウト（`--layout`）

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

`--layout` は、ジオメトリと role のヒントを伴う代替の読み順ビューを追加します。ネイティブテキストを置き換えることはありません。JSON/XML/TOON では、`pages[].layout` は `--layout` を指定したときにだけ現れ、`pages[].text` は変更されない pdf.js のストリームのままなので、block と raw text を突き合わせて比較できます。Markdown は例外で、常に内部でレイアウトパスを実行するため、block が 1 つでもあればページごとの本文はレイアウトで再構築された読み順になり、block が無いときだけ `pages[].text` にフォールバックします。Markdown での `--layout` が制御するのは構造的な追加要素だけです ── ページごとのレイアウト table セクションと、Overview の `Blocks` / `Tables` 列です。なお `pages[].layout.lines` というフィールドは存在しません ── line は `blocks[].lines` の下にあります。

複数段の読み順: `blocks[]` は右側の段より先に、左側の段を上から下まで読みます。レイアウトパスは、繰り返し現れる細い gutter（段間の余白）や、繰り返し現れる右側パネルの開始位置を、段組みや表の区切りとして扱います。これには、数値のサイドパネルがあるために本文の段が物理ページ幅の一部しか占めない横向きページも含まれます。pdf.js が単語を別々の span として出力する場合でも、Latin/Arabic 文字の詰まった単語間スペースを保持し、字間を空けた短い CJK のタイトル行（例: `科 学`）は 1 行にまとめ、インデントされた単独行はページ全体を分断するセパレータにせず最も近い残存する段に付属させ、大きなドロップキャップが後続の段落行を飲み込まないようにし、周囲の本文から独立した細い数字だけのページラベルは本文と切り離し、下部の小さな許諾表示やフッター注記は 2 段組み本文の後ろに移動します。また、本文サイズの 1 グリフずつの CJK 縦書きの連なり、コンパクトな見出し用 CJK グリフの積み重ね、視覚的に縦書きと分かる縦長の CJK span も検出します。ジオメトリとソース順が一致する場合は、縦中横（tatechuyoko）の数字グループを同じ縦の段の中でインラインのまま保持し、各段を上から下へ結合し、隣接する本文の段を右から左へまとめて段間を `\n` でつなぎ、それらの block / line には `writingMode: "vertical"` を付与するので、利用側が横書きの行と誤認しません。ふりがな/ルビは、隣接する縦のルビ列や行上の横書きかな連なりが曖昧さのない CJK ベース範囲に対応付けられる場合、レイアウトテキストに `base《ruby》` として付与されます。それ以外の場合は、単独のレイアウトノイズになるくらいなら除外されたままになります。縦書き本文の段の右側 gutter にある短い中サイズの注記参照マークも、単独のレイアウト block になるくらいなら除外されます。`pages[].text` は、同じ本文サイズの縦書き連なり検出器を、ストリーム順での結合としてのみ適用します。ソースの item 順がすでに上から下へのジオメトリと一致している場合にだけ検出した段を結合し、並べ替えはせず連なりごとにフォールバックします。単独の level-1 / level-2 見出しは段の区切りとして働きます。level-3 候補はその段の中に留まるため、subsection の区切りが読み順を混乱させることはありません。block のクラスタリングは依然としてヒューリスティックであり、表のセルが 1 つの block にマージされることがあります。

繰り返し chrome の検出は、block のクラスタリングの後に実行されます。複数行からなる端の block のうち 1 行だけが、近くの本文にくっついたスライドのフッターのような繰り返しページ chrome である場合、pdfvision はその行を独立した `repeated: true` の block に分割し、隣接する本文の行は repeated ではないままにします。このフィールドは JSON/TOON にそのまま存在します。XML では `<block repeated="true">` を使い、Markdown は `--strip-repeated` を指定したときだけその block を省略します。ページの左右端にある細い縦の block も、chrome と判定される前に裏付けが必要です。`。` や `、` を含む文らしいテキスト、および chrome とみなす短さの上限を超える縦書きの端テキストは、決して `repeated` とマークされません。複数ページ抽出では、同じ正規化された短い端テキストが選択された少なくとも 2 ページで繰り返されている必要があります。単一ページ抽出では、`第`、`章`、数字、`第1章` のようなラベルなど、保守的な短いマーカーだけがマークされます。`Yes.`、`No.`、`STOP` のような短いフォームコントロールのラベルは、決定木形式の指示でページ端に繰り返し現れても、ページ chrome としては扱われません。

`tables[]` は、整列した数値の表に対する保守的な行優先（row-major）のヒントです。複数の行に複数セルがあり、かつ数値セルが 2 つ以上ある場合に現れます。これは財務諸表や政府の統計表によく見られる形です。コンパクトな 2 列の年/値の表も、規則的な行が十分にあって表の形が明確な場合は含まれます。完全な表パーサーではなく、視覚的な構造を補助するものとして扱ってください。結合されたヘッダー、続きのラベル、脚注については、依然として `--render` / `--render-region` が必要になることがあります。ただし `rows[].cells[]` は、表がラベル列と数値列に分かれることで `blocks[]` がしばしば失ってしまう行/セルの順序を保持します。密で繰り返し現れる数値の gutter は、表を構築する前に分割されます。視覚的なグリッドが規則的な場合に隣接する値が 1 つのセルに潰れないようにするためで、カンマ区切りの値や `13.0x` のような比率セルを含むコンパクトなサイドテーブルにも適用されます。数値 span が 3 つ以上ある密な行では、同じ行内の細い数値 gutter も分割されることがあります。末尾の通貨記号が視覚的に次の値の列を示している財務諸表の行も含みます。繰り返し現れる数値列が 3 つ以上ある幅広の表では、最初にすべてのセルが埋まる行の直前にある短い先頭ヘッダー行やまばらな最初の行も保持されます。`1.0 · 10^20` のような科学的記数法のセルや `298 / 400 (~90th)` のようなスコア/パーセンタイルのセルも含み、表の bbox は人間の目に見える表の一番上から始まります。行をグルーピングする際、出版社の表罫線に由来する装飾的な点線ルールのテキストは無視されるため、縦に長い点線の罫線がすべてのセルを 1 行に飲み込むことはありません。近くにあるラベルのみの続き行は、セクションヘッダーのように見えない限り、次の行のラベルに畳み込まれます。ラベル付きの行に繰り返し現れる数値列がある場合、行間隔が不規則でも受け入れられます。そのため、複数行のラベル、小計の隙間、繰り返し現れる年の列の前にある長い文章調のラベルを持つ財務表は、隣接する本文として切り詰められることなく表示され続けます。分離した通貨記号は、行内の位置から関係が明確な場合、後続の数値セルに畳み込まれます。

### 見出しレベル（`role === 'heading'`）

`role` は、block が見出しとして分類されたときに設定されます。`level` は視覚的な階層をランク付けします。

- `level: 1` — 論文/ページのタイトル（fontSize が本文中央値の 1.40 倍以上、または 1.25 倍以上帯にあるページ上部の文書タイトル）。
- `level: 2` — セクション見出し（旧ルールでは 1.25 倍以上、構造的な裏付けがあれば 1.15 倍以上: 短く、単独であるか近傍より局所的に大きいこと）。典型的な LaTeX の 12pt-over-10pt のセクションスタイルを捉えます。
- `level: 3` — subsection 候補（1.08 倍以上、単独の短い行、同じ段内の近傍より局所的に大きいこと）。信頼度は低めで、ResNet 論文の `3.1.` や `3.4.` のような見出しです。

ユースケースに合わせて範囲を選んでください。
- タイトルのみ: `role === 'heading' && level === 1`。
- 高精度（セクションのみ）: `role === 'heading' && level <= 2`。
- 再現率重視（subsection を含む）: `role === 'heading'` すべて。

繰り返し chrome は見出し分類より優先されます。見出しの形をしたランニングヘッダー/フッターが `repeated: true` とマークされた場合、pdfvision は `role`、`level`、`roleConfidence` を落とすため、繰り返しページ chrome が見出し一覧に現れることはありません。本文をチャンク分割する際も、まず `repeated: true` でフィルタしてください。
## Span（`--geometry`）

```ts
interface TextSpan {
  text: string;              // NFKC-normalized and C0-cleaned by default (disable with --no-normalize)
  x: number; y: number;      // unrotated page view, top-left origin
  width: number; height: number;
  fontSize: number;          // largest finite non-zero text-matrix scale; otherwise reported/effective item height
  fontName?: string;         // stable page-local alias e.g. "font1"
}
```

公開される span はそれぞれ、保持された位置情報付き pdf.js テキスト item 1 つに対応します。その `text` は 1 文字、1 単語、あるいはもっと長い文字列の場合があります。隣接する item は、公開される `spans[]` の中でマージされたり分割されたりしません。レイアウトや検索は、その粒度を変えずに行を再構築したり一致 box を切り出したりすることがあります。丸められた bbox は item の集約された軸並行の外接矩形であり、個々のグリフの輪郭ではありません。重複排除は正規化の前に実行されます。そのキーは、raw の `str`、raw の `fontName`（無ければ空）、width、有効な height、そして小数第 3 位に丸めたすべての transform 成分（無ければ `no-transform`）を使います。有効な height は、正の報告済み height があればそれを使い、無ければ有限かつ非ゼロの text-matrix スケールのうち最大のもの、それも無ければゼロになります。`fontSize` はまずその最大の利用可能な matrix スケールを使い、両方の matrix スケールが利用不能な場合にのみ、報告済み/有効な item の height にフォールバックします。キーが一致する場合は最初の item を残し、`hasEOL` は OR で結合されます。同じ raw テキストでも transform が異なれば別物として扱われる一方、異なる raw item が正規化後に同一の公開テキストになることもあります。transform を持たない item（prepress 制作用テキストである可能性が高いもの）、空白のみの item、正規化後に空になる item は省略されます。`fontName` はページ内で安定したエイリアスです。ジオメトリを含めると出力が大幅に大きくなることがあります。

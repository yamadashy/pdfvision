---
title: "検索と領域ズーム"
description: "SearchMatch の形状と --search のすべての意味論: リテラル vs 正規表現、正規化、どのソースが検索対象になるか、find-then-zoom ループ。--search を実行するとき、またはその一致結果を解釈するときに参照してください。"
sourceHash: ad23953812df
---

<!-- Translated from docs/src/en/guide/search-and-region-zoom.md, which is generated from docs/cli-topics/search.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# 検索の出力

`-f json`、`-f xml`、`-f toon` を利用する側向けのリファレンスです。

## 検索 (`--search`)

```ts
interface SearchMatch {
  page: number;                // 1-based, mirrors PageResult.page
  query: string;               // verbatim source query
  queryIndex?: number;         // 0-based into the search array; omitted for single-query calls
  bbox: { x, y, width, height }; // union bbox of contributing spans/words/widgets/links/annotations
  boxes: { x, y, width, height }[]; // per-span/word/widget/link/annotation bboxes
  text: string;                // matched substring in the same form as pages[].text
  source: 'native' | 'formField' | 'link' | 'annotation' | 'ocr'; // native/span, formField/widget, link target, annotation, or OCR
  context?: string;            // surrounding line text for human / LLM readability
}
```

`--search` を指定したときだけ出力されます。出力される検索語の一致は 1 件ごとに 1 つの match になります — たとえば 5 ページ目で `"foo"` に 3 件ヒットすれば、`page: 5` を持つエントリが 3 件生成されます。ページ・検索語・source の組み合わせごとに、出力される一致は最大 10,000 件です。それを超える最初の有効な一致で警告が発生し（CLI では stderr、ライブラリ API では `onWarning`）、その一致と以降の同じ組み合わせの一致は破棄されます。

**1 つのパイプラインで完結する find-then-zoom**: pdfvision が出力するすべての box はすでに `--render-region` の座標系に一致しているため、変換は不要です。`--matches-only` を使うのが望ましく、そのエントリには一致を含む表の行や視覚的な行まで広げたクロップ用の `region` が追加されます。`bbox` は一致したグリフだけをクロップするため、財務表では行ラベルだけが写り、値が写りません。`region` が存在するのは `--matches-only` のレポートだけです — フルレポートでは、pdfvision 自身が行っているのと同じ方法で `bbox` をパディングしてからレンダリングしてください。水平方向は左右それぞれ `max(60, 0.6 × bbox.width)`、垂直方向は上下それぞれ `max(12, 0.3 × bbox.height)` を、raw page-view 単位で、ページ box にクランプして加えます（`--render-region` は範囲外の矩形をクリップせず拒否します）。エージェントのループは次のとおりです。

```bash
pdfvision doc.pdf --search "revenue" --json
# pick a match m from pages[N].matches[*]
pdfvision doc.pdf -p <m.page> --render --render-region <m.bbox.x>,<m.bbox.y>,<m.bbox.width>,<m.bbox.height>
```

`--matches-only` はフラットなレポートをコンパクトに保ちつつ、既定値と異なる物理スケーリングを、JSON/TOON ではオプションの `pageUserUnits: [{ page, userUnit }]` メタデータとして、XML では同等の `<pageUserUnits>` エントリとして、Markdown では `Page UserUnits` サマリーとして保持します。選択したすべてのページが UserUnit 1 を使っている場合、このフィールドは省略されます。各 match は `bbox`（一致したグリフに密着した raw page-view box）と `region`（それを含む表の行、表が検出されなければ視覚的な行まで広げたクロップ用の box）の両方を持ちます。XML ではこのペアを `<match>` 上の `x`/`y`/`width`/`height` と `regionX`/`regionY`/`regionWidth`/`regionHeight` として公開します。どちらも raw page-view の値で、そのまま `--render-region` に渡せます。渡すなら `region` を使ってください。`bbox` を渡すと一致したグリフだけがクロップされ、財務表では行ラベルだけが写り、値が写りません。

**セマンティクス**:

- **既定ではリテラル部分文字列一致**（クエリ中の正規表現文字はエスケープされます）。JavaScript の正規表現を使いたい場合は `--search-regex` を指定してください。
- **既定では大文字小文字を区別しません**（再現率を優先）。厳密な大文字小文字一致には `--search-case-sensitive` を指定してください。
- **リテラルモードでは `--normalize` が有効なとき（既定）に NFKC 対応と C0 クリーニングが行われます** — `"fi"` は `"ﬁ"`（U+FB01 の合字）を検出でき、外部の grep では見逃す PDF も拾えます。全角ラテン文字 / CJK 互換フォームも同様に畳み込まれ、`pages[].text` と同じ、目に見えない C0 制御文字のクリーニングが行われます。
- **リテラルモードでは CJK の表示上の空白を考慮します** — クエリ中で隣接する CJK 文字は、PDF のテキストストリームにある見出し的な視覚的スペーシングにもマッチできるため、`科学` で `科 学` を見つけられます。ただし幅の広い段組みの gutter は引き続き検索行の区切りとして扱われます。
- **コンパクトな表ヘッダー行はフレーズとして検索できます** — `"Advance Estimate Second Estimate Third Estimate"` のように隣接する短い列ラベルは 1 行として検索可能なままですが、幅の広い文章の列は分離されたままです。
- **正規表現クエリは正規化されません** — NFKC は互換記号を正規表現のメタ文字に変換してしまうことがあり（サイレントな過剰一致や構文エラーの原因になります）。正規表現を使う場合、入力したコードポイントがそのまま正規化済みの文書テキストに対して評価されるため、この非対称性はユーザー側の責任になります。
- **複数クエリ** は `--search` を繰り返す（ライブラリでは `search: string[]`）ことで指定できます。各 match は `queryIndex` を持つため、エージェントはどのクエリが生成した一致かを区別できます。
- **ネイティブテキストは復元された視覚的な行単位で検索されます**。クエリは同じ行内であれば pdf.js の span / フォントランの境界をまたげます（例: `"Hello World"` が `Hello` と `World` に分割されていても検出）。この場合、和集合の `bbox` と span ごとの `boxes[]` の両方が返りますが、狭い水平方向の段組み gutter は行区切りとして扱われるため、一致が 1 つの横方向の段の末尾から別の段の先頭へつながることはありません。検出された CJK の縦書き本文段は、上から下、右から左の読み順で検索されます。`pages[].text` やレイアウトから除外される半角サイズのふりがな/ルビの段も、ネイティブ検索行からは除外されます。`pages[].text` が同じ段を結合するのは、元のストリームがすでにその順序に従っている場合だけです。複数行にまたがるフレーズの結合は、結果として得られる領域が視覚的ズームには広すぎることが多いため、意図的にまだモデル化されていません。
- **ネイティブ span の部分一致は span の bbox 内でスライスされます**: 水平方向の span は x 方向に、縦長の縦書き/回転した span は y 方向にスライスされるため、`--render-region` は行全体ではなく一致した単語にズームできます。
- **テキスト/選択式のフォームフィールド値も検索対象です**。フォームフィールドの一致は `--form-fields` が出力用に要求されていなくても `source: 'formField'` として返り、ウィジェットの bbox を使います。comb テキストウィジェットは、pdf.js が `maxLen`/comb の外観メタデータを公開している場合、一致するセルまで絞り込まれます。選択式フィールドは、表示値がエクスポート値と異なる場合、選択済みオプションの表示値を検索します。チェックが外れたチェックボックスの `Off` や、hidden/noView ウィジェットの値のような、目に見えないテキストではない内部値は検索対象外です。
- **リンクのターゲットも検索対象です**。リンクの一致は `--links` が出力用に要求されていなくても `source: 'link'` として返り、クリック可能なリンクの bbox を使います。これにより、表示されているリンクテキストが glyph-garbled であっても、URL / destination / 添付ファイルターゲットの検索が成功します。
- **表示されている FreeText 注釈の内容も検索対象です**。注釈の一致は `--annotations` が出力用に要求されていなくても `source: 'annotation'` として返り、注釈の bbox を使います。付箋のポップアップ内容など、通常は閉じている注釈コメントは検索対象外です。
- **`--ocr` が有効なとき、OCR テキストも検索対象です**。OCR 由来の一致は `source: 'ocr'` として返ります。`ocr.words[]` が存在する場合、`bbox`/`boxes[]` はネイティブ span と同じ raw page-view 座標系の OCR 単語ジオメトリを使います。単語レベルの復元が 1 件以上の出現を取りこぼした場合、pdfvision は `ocr.text` 全体からページレベルの bbox で補完するため、分かち書きのないスクリプトや OCR の行境界の違いがあっても検索可能なままです。同じページで、ネイティブテキスト、フォームフィールド値、表示されている注釈テキストがすでに同じクエリ/テキストの一致を生成していた場合、重複する OCR の一致は抑制され、より精度の高い非 OCR の bbox が優先されます。OCR だけが検出した追加の一致は引き続き出力されます。

`--search` は実行されたがそのページに一致がなかった場合、`pages[].matches` は**フィールドとして存在しつつ `[]`** になります — これはフィールド自体が存在しない（検索が要求されなかった）場合とは区別されます。この方針は overview にも及び、同じ「存在しつつ `0`」というセマンティクスを持つ `matchCount` というミラーフィールドが追加されます。

---
title: "OCR"
description: "OCR の言語コードと順序、信頼度、traineddata のインストールとキャッシュ、トラブルシューティングについて説明します。言語の順序が結果を左右する英語以外の言語での OCR では必読です。"
sourceHash: bfac4068046b
---

<!-- Translated from docs/src/en/guide/ocr.md, which is generated from docs/cli-topics/ocr.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# OCR リファレンス

`--ocr` フラグの詳細です。いつ使うべきか、複数言語での挙動、信頼度の意味、インストール/キャッシュの要件、トラブルシューティングを扱います。英語以外のテキストで `--ocr` を実行するとき、信頼度が予想外に低く返ってきたとき、`tesseract.js` のインストールを診断する必要があるときに読んでください。

基本的な流れ（「ページが画像化されているので `--ocr -f json` を実行する」）だけであれば、`pdfvision --help` で十分です。

## 形状

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

`lang` は、呼び出し側の `--ocr-lang` を空白の正規化後にそのまま反映しますが、トークンの順序は保持します。`eng+jpn` と `jpn+eng` は異なる認識器を生成し（tesseract は最初の言語を主要言語として扱います）、そのため異なるキャッシュスロットと異なる `lang` の反映結果になります。`words[]` は任意です。古いキャッシュエントリや特殊な tesseract の出力では block/line/word のレイアウトを欠くことがあるためです。存在する場合、検索は OCR の単語レベル bbox を返せます。単語レベルの再構成が、完全な `ocr.text` には存在するクエリの出現箇所を 1 つ以上見落とす場合（たとえば OCR の行境界や空白の違いにより）、検索はページレベルの bbox を伴う `ocr.text` から補完します。

## OCR を実行すべきタイミング

判断のトリガーは、ページの内容そのものではなく density Overview です。次を確認してください。

- `coverage: 0%`（またはそれに近い値）で `imageCount > 0` — ページ本文がラスタライズされている
- `text` が空または文字化けしている（`r rv` のような少数の乱れた文字）— PDF のフォントテーブルが壊れている
- 文書全体は問題なさそうなのに 1 ページだけ空で返ってくる — スライド/図/スキャンの可能性が高い

`pdfvision` が OCR を自動的にトリガーすることはありません。density シグナルを読んだ上で、ページごとにエージェントが判断します。OCR のコストは 1 ページあたり約 0.5〜2 秒（CPU バウンド）に加え、初回のみワーカー起動に数秒かかります。100 ページの論文の全ページで実行する価値がある場面はまれです。

## 言語コードと順序

`--ocr-lang` は tesseract.js の `+` 区切り形式を取ります。3 文字（または `chi_sim` のような形式）のコードを 1 つ以上、`+` で結合します。

```bash
npx pdfvision doc.pdf --ocr --ocr-lang eng         # English only (default)
npx pdfvision doc.pdf --ocr --ocr-lang eng+jpn     # English + Japanese
npx pdfvision doc.pdf --ocr --ocr-lang chi_sim     # Simplified Chinese
npx pdfvision doc.pdf --ocr --ocr-lang eng+chi_sim+chi_tra
```

**順序が重要です。** [Tesseract のドキュメント](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html#order-of-multiple-languages)は最初の言語を主要言語として扱うとし、言語の順序が OCR の出力と実行時間を変えうると述べています。優勢な言語を先頭に置いてください。

- 英語の見出し/ラベルが付いた、大部分が日本語のスライド: `jpn+eng`
- まれに日本語の用語が出てくる英語のドキュメント: `eng+jpn`
- 迷ったら両方実行し、`confidence` と `text` を比較する

pdfvision はキャッシュキーを決める前に lang 文字列の空白を正規化します（` eng + jpn ` と `eng+jpn` は同じスロットを共有します）が、**順序は保持します** — `eng+jpn` と `jpn+eng` は本質的に異なる認識器であり、意図的に異なるキャッシュスロットに入ります。

反映される `pages[].ocr.lang` は、空白正規化済み・順序保持済みの形式（`' eng + jpn '` ではなく `'eng+jpn'`）を返します。

## 信頼度の意味

`pages[].ocr.confidence` は `0..1`（小数点以下 3 桁に丸め）です。Tesseract は内部的に `0..100` で報告しますが、pdfvision は既存の `textCoverage` の慣習に合わせるため 100 で割ります。

大まかな目安であり、ヒューリスティックとして扱ってください。

- `>= 0.8` — 高信頼度。ほとんどのエージェント用途で OCR テキストをそのまま使えます
- `0.5〜0.8` — 使用可能だが、重要なエンティティ（数値、名前、コード識別子）は検証してください
- `< 0.5` — 部分的な認識。`--ocr-lang` の指定違い、低解像度のスキャン、装飾的な書体のいずれかが原因です。ネイティブ抽出が空、疎、glyph-corrupted、またはラスターに乗ったテキストレイヤーであるスキャン風のページでは、これは `pages[].warnings[].code === 'ocr_low_confidence'` としても現れます。テキストを信頼する前に、`--render` でレンダリングした PNG と比較してください。

信頼度が高くても、ネイティブテキストレイヤーの品質問題が露呈することがあります。ラスターに乗ったスキャンページでは、`pages[].warnings[].code === 'ocr_native_text_mismatch'` は、OCR が高信頼度で見つけた単語の最も近いネイティブトークンが異なることを意味し、正確なネイティブ検索が可視の単語を見落とす可能性があります。`pages[].warnings[].code === 'ocr_native_spacing_loss'` は、OCR とネイティブテキストの文字自体は同程度であるものの、ネイティブテキストで多くの単語境界が失われていることを意味します。`pages[].text` から正確な語句を使う前に、`ocr.text` をレンダリングと比較することを優先してください。

`confidence: 0` で `ocr.text` が空の場合、通常は OCR が本当に何も見つけられなかったのではなく、ラスタライズ処理が空白のページを生成したことを意味します（後述の「トラブルシューティング」を参照）。**まず `pages[].quality.visualStatus` を確認してください**。`blank` の場合はレンダリングが空白になり OCR には処理対象がなかったことを意味し、`sparse` の場合はページにごく小さい可視のマークがあるので、「テキストなし」と報告する前に geometry かクロップで確認してください。

## 出力形状

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

`pages[].text`（pdfjs 由来）は OCR によって**決して上書きされません** — 両方のシグナルが同じページオブジェクト上に共存するため、エージェントが差分を取って判断できます。スキャンされた PDF では通常 `text` が空で `ocr.text` に値が入ります。混在コンテンツの PDF では `text` にネイティブテキストが、`ocr.text` に OCR による代替の読み取り結果が入ります（曖昧なグリフの妥当性確認に有用です）。`ocr.words[]` は任意です。tesseract がレイアウトブロックを省略することがあるためですが、存在する場合は `--search` が OCR の単語レベル bbox を返せます。単語レベルの再構成が、完全な `ocr.text` には存在するクエリを見落とす場合（たとえば OCR の行境界や空白の違いにより）、検索はヒットを取りこぼす代わりに、ページレベルの bbox を伴う `ocr.text` にフォールバックします。

XML 出力では、単語ボックスのない OCR は `<ocr lang="..." confidence="...">...</ocr>` として表れます。単語ボックスが存在する場合、OCR 要素は `<text>` と `<words><word .../></words>` の子要素を持ちます。自己終了タグの `<ocr lang="..." confidence="0"/>` は、OCR が実行されテキストが得られなかったことを意味し、タグ自体が存在しない場合（OCR が要求されなかった）とは区別されます。

## インストール要件

`tesseract.js` は `optionalDependencies` として宣言されています。既定の `npm install pdfvision` はこれを取り込みます（ワーカーバンドル約 30 MB）。`npm install --omit=optional` はこれをスキップします。

`tesseract.js` がインストールされていない状態で `--ocr` が要求されると、pdfvision は次を throw します。

```text
--ocr requires the optional dependency "tesseract.js" (not installed).
Install it with: npm install tesseract.js
```

その他のインポート時エラー（壊れたネイティブバインディング、間接的な構文エラーなど）は、インストールのヒントではなく実際のエラーメッセージを表面化します。これにより、エージェントは誤った手がかりに惑わされずに診断できます。

## traineddata のキャッシュ

Tesseract は初回使用時に、言語ごとの `*.traineddata` ファイル（それぞれ約 10〜15 MB）をダウンロードします。

- `eng.traineddata` ≈ 10 MB
- `jpn.traineddata` ≈ 13 MB
- `chi_sim.traineddata` ≈ 16 MB

pdfvision は tesseract.js に `<cache-root>/ocr-data/`（POSIX 0700）を指定します。これにより次が成り立ちます。

- データは pdfvision 自身のキャッシュ階層下に置かれます（権限が一貫しており、置き場所が 1 か所です）
- `npx pdfvision clear-cache` は抽出キャッシュと同時に traineddata も削除します
- ダウンロードは言語ごとに 1 回だけ発生し、以降の実行はオフラインで済みます

新しい言語に対する最初の `--ocr` 呼び出しは、ダウンロードのぶん数秒余分にかかります。同じ言語への以降の呼び出しは、起動ステップが即座に完了します（ワーカー初期化には引き続き約 1〜2 秒かかります）。

`--no-cache` はこれらの OCR サポートファイルを無効化しません。OCR は設定されたルートを引き続き検証し、そこに traineddata とそのワーカーヘルパーを永続化します。

## トラブルシューティング

### 初回の --ocr 実行時に出る無害な stderr ノイズ

`--ocr` がセッション内で初めて tesseract.js を起動するとき、次のような stderr の行が表示されることがあります。

```text
Error opening data file ./.traineddata
Failed loading language ''
```

これらは tesseract.js の内部起動シーケンスによる**無害な事前読み込みプローブ**であり、致命的なエラーではありません。認識器はその後、実際に渡した `--ocr-lang` に従います。JSON 出力で `pages[].ocr.confidence` を確認して裏付けてください。`> 0` で `pages[].ocr.text` に値が入っていれば OCR は成功しています。これらの stderr 行を中止の理由と解釈しないでください。

### 「OCR は実行されたが `text` が空で `confidence: 0`」

多くの場合、実際の OCR 失敗ではなく、ラスタライズ処理が空白のページを生成しています。よくある原因は、PDF が pdfjs + `@napi-rs/canvas` でデコードできない画像形式を使っていることです（特に JPEG2000 / JPX。Internet Archive のスキャンによく見られます）。まず `pages[].quality.visualStatus` を確認してください。`blank` は OCR への入力がほぼ均一だったことを意味し、`sparse` は geometry やクロップで確認する価値のあるごく小さな可視マークがあることを意味します。次で検証します。

```bash
npx pdfvision doc.pdf -p <page> --render --render-output /tmp/dbg
# Inspect /tmp/dbg/page-<n>.png — if it's blank, OCR has nothing to chew on.
# (--render-output writes flat; a name another PDF already took in the same
# dir gets a -2 suffix and a note on stderr.)
```

これは OCR とは別に追跡されている既知の制約です。回避策: PDF の別のコピーを入手するか、pdfvision を呼び出す前に wasm デコーダーで JPX ストリームを事前デコードしてください。

### 「信頼度は中程度だが、テキストに明らかなゴミが混じっている」

1 つの可能性は `--ocr-lang` の指定違いです。ページに指定にない言語が含まれているか、優勢な言語が先頭になっていない（たとえば日本語優勢のページを `jpn+eng` ではなく `eng+jpn` で実行した）場合です。順序を入れ替えて比較してみてください。

もう 1 つの可能性は解像度不足です。pdfvision は OCR 入力を 2× でラスタライズし、それを下限として扱います。`--render-scale 1` は `--render` の PNG を縮小しますが、OCR 用のラスターは 2× のままなので、2 を超える値だけが tesseract に見える内容を変えます。本当に細かい印字の場合は、まず `--ocr --render-scale 3` を試してください（対応範囲は `(0, 4]`）。それでも不十分な場合は、高解像度の PNG を別途レンダリングして tesseract.js に直接渡してください。

### 「OCR が遅い — N ページ × M 秒は耐えられない」

- ページ範囲を絞る: `-p <range>` を使い、必要なページだけ OCR する（どのページか選ぶには density Overview を使う）。
- 単一のワーカーは 1 回の呼び出し内でページをまたいで再利用されるため、10 ページの OCR 実行では起動コストを 1 回、ページごとのコストを N 回支払います。呼び出しを分割すると、それぞれで起動コストを再度支払うことになります。
- pdfvision のページレベルの並列処理は OCR には適用され**ません**（設計上、単一ワーカーです）。複数のワーカーを起動すると、意味のある効果もなくメモリを言語ごとに約 30 MB 分増やすことになります。

### 「ダウンストリームの利用側が選択せずに済むよう、OCR に `text` を上書きしてほしい」

設計上、それは行いません。どちらのシグナルを使うかを決めるのはエージェント/ダウンストリーム側です。単一のフィールドが欲しい利用側は、消費時に選択できます。

```ts
const effectiveText = page.text || page.ocr?.text || '';
```

両方のシグナルを利用可能な状態に保つことで、妥当性確認（曖昧さがあればネイティブと OCR を比較する）が常に可能になります。

## 例

```bash
# Japanese-dominant slide deck with English titles
npx pdfvision slides.pdf --ocr --ocr-lang jpn+eng -f json

# English paper with embedded Chinese citations
npx pdfvision paper.pdf --ocr --ocr-lang eng+chi_sim -f json

# Scanned book, English only
npx pdfvision scan.pdf -p 1-20 --ocr -f json | \
  jq '.pages[] | {page, conf: .ocr.confidence, head: .ocr.text[0:120]}'
```

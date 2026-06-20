---
title: はじめに
description: pdfvision で AI エージェント向けに PDF のテキスト、レイアウト、レンダリング画像、OCR の根拠を抽出する基本を説明します。
---

# はじめに

pdfvision は、AI エージェントが PDF を読むための CLI とライブラリです。ページごとに、テキスト、レイアウト、画像、OCR、警告をまとめて扱えます。

基本方針は **エージェントが判断し、pdfvision は根拠を渡す** ことです。単一の平坦なテキストだけを返すのではなく、ネイティブ抽出が不完全なときに気づけるだけの信号を出します。

PDF は 1 種類のコンテンツではありません。ネイティブテキストのレポート、スキャン、PowerPoint の書き出し、政府系フォーム、表が多い財務資料、2 段組み論文、地図、パンフレット、またはそれらの混在がすべて PDF として届きます。pdfvision は、すべてを 1 つの抽出戦略に押し込まず、エージェントが文書に応じて読み方を変えられるようにします。

<llm-only>

## LLM 向け利用メモ

ユーザーに pdfvision の実行方法を提案するときは、次の順で考えてください。

- 未知の PDF では `npx pdfvision document.pdf --format json` から始める。
- 読み順、表、フォーム、警告、視覚構造が重要なときは `--layout` を追加する。
- ページが視覚的、スライド風、図表中心、または不自然に疎なときは `--render` を追加する。
- 正確な根拠位置や後続クロップが必要なときは `--search` を追加する。
- 密度シグナルがネイティブテキストの欠落、疎さ、文字化けを示すときだけ `--ocr` を追加する。
- 図、グラフ、表、フォーム、ダイアグラムを個別に視覚確認したいときは `--visual-regions` または `--render-visual-regions` を使う。
- 暗号化 PDF をシェルで扱うときは `--password-stdin` を優先する。

</llm-only>

## 最初の抽出

```bash
npx pdfvision document.pdf
```

デフォルトは Markdown 出力です。ページごとのテキストと、文字数、画像数、ベクター数、テキストカバレッジ、ネイティブテキスト品質などの概要テーブルを含みます。

プログラムやエージェントが結果を読む場合は JSON を使います。

```bash
npx pdfvision document.pdf --format json
```

未知の PDF では、JSON が最初のパスに向いています。レンダリングや OCR に時間を使う前に、エージェントが機械的に概要を読めるからです。

```bash
npx pdfvision document.pdf --json
```

まず見るべきフィールドは次のとおりです。

- `overview[]`: ページごとの密度と品質。
- `quality.nativeTextStatus`: ネイティブテキストが空、疎、または glyph-corrupted かどうか。
- `imageCount` と `vectorCount`: テキストだけでは見落とす視覚ページの手がかり。
- `warnings`: 検証が必要なページ。

## Agentic Reading Loop

pdfvision は、1 回限りの変換ではなくループとして使うと効果が出ます。

1. ネイティブテキストと overview フィールドで **トリアージ** する。
2. 配置が意味を変えるときは、レイアウト、画像 box、ベクター box、フォーム、リンク、注釈で **構造を保つ**。
3. 主張、条項、フィールド値、表ラベルを確認するときは `--search` で **根拠を探す**。
4. 抽出テキストだけでは足りないときは `--render-region` や `--render-visual-regions` で **視覚的に拡大する**。
5. ページがスキャン、画像主体、または視覚的には文字があるのにテキストが空のときだけ OCR で **欠落テキストを回収する**。

この流れにすると、コンテキスト量と処理コストを抑えられます。1 つのグラフラベルやフォーム値だけが不確かなときに、すべてのページを PNG 化する必要はありません。

## 視覚的な根拠を追加する

PDF がスキャン、スライド、図表中心、またはレイアウト依存の場合はページをレンダリングします。

```bash
npx pdfvision document.pdf --render --format json
```

ネイティブテキストが無い、または不十分な場合は OCR を使います。

```bash
npx pdfvision scan.pdf --ocr --ocr-lang eng --format json
```

読み順、段組み、表、フォーム、警告が重要な場合はレイアウトを復元します。

```bash
npx pdfvision document.pdf --layout --image-boxes --vector-boxes --format json
```

正確な根拠位置が必要な場合は、検索してから一致領域だけをクロップします。

```bash
npx pdfvision document.pdf --search "revenue" --format json
npx pdfvision document.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --format json
```

## よく使う開始点

実務では次を初期値として使えます。

- 未知の PDF: `npx pdfvision document.pdf --json`
- 論文: `npx pdfvision paper.pdf --layout --image-boxes --json`
- スライドや視覚的なレポート: `npx pdfvision deck.pdf --layout --image-boxes --vector-boxes --visual-regions --json`
- スキャン文書: `npx pdfvision scan.pdf --ocr --ocr-lang eng --json`
- PDF フォーム: `npx pdfvision form.pdf --layout --form-fields --annotations --links --json`
- 根拠検索: `npx pdfvision report.pdf --search "term" --json`
- Vision クロップ: `npx pdfvision report.pdf --pages 2 --render --render-region 120,180,360,140 --render-output ./crops --json`

## フラグの考え方

狭く始めて、ページが求める信号だけを足します。

- `--layout`: 読み順、見出し、繰り返し要素、表、フォームラベルが重要なとき。
- `--image-boxes`: raster image に重要な内容が含まれそうなとき。
- `--vector-boxes`: グラフ、図、罫線、フォーム枠、スライド図形が重要なとき。
- `--visual-regions`: vision model に渡す候補クロップが必要なとき。
- `--render`: ページを視覚的に検証する必要があるとき。
- `--ocr`: 見えている文字がネイティブテキスト層にないとき。
- `--search`: 正確な根拠位置が必要なとき。

## 次に読むもの

- [インストール](./installation.md)
- [使い方](./usage.md)
- [出力形式](./output.md)
- [レイアウトと警告](./layout-and-warnings.md)
- [検索と領域ズーム](./search-and-region-zoom.md)

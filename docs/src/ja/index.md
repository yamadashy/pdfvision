---
layout: home
title: pdfvision
titleTemplate: AI エージェント向け PDF 信号抽出
hero:
  name: pdfvision
  text: AI エージェントに人間のような PDF 視覚を
  tagline: PDF からテキスト、レイアウト、視覚領域、OCR、メタデータ、警告、レンダリング画像を抽出し、エージェントが単一の平坦なテキストではなく PDF 上の根拠を確認できるようにします。
  image:
    src: /logo.svg
    alt: pdfvision
  actions:
    - theme: brand
      text: はじめる
      link: /ja/guide/
    - theme: alt
      text: GitHub
      link: https://github.com/yamadashy/pdfvision
features:
  - title: エージェント向け PDF トリアージ
    details: まず低コストなネイティブテキストとページごとの品質シグナルを見て、レンダリング、OCR、検索、クロップの必要性を判断できます。
  - title: 必要なときだけ視覚的な根拠
    details: ページ全体、正確な領域、図・グラフ・表・フォーム・ダイアグラム候補をレンダリングし、マルチモーダルモデルに渡せます。
  - title: レイアウトと警告シグナル
    details: 見出し、段組み、表、フォームラベル、リンク、注釈、抽出不備を示す警告を保持します。
---

## なぜ pdfvision か

多くの PDF 抽出ツールは、エージェントに 1 本の文字列だけを渡し、その結果を信頼することを前提にします。現実の PDF ではそれだけでは壊れます。2 段組みの論文、意味が図形に埋まったスライド、グラフや表を含むレポート、政府系フォーム、OCR の残骸を含むスキャン、互換字形や文字化けを含む多言語 PDF では、テキストだけでは根拠が足りません。

pdfvision は次のループを前提にしています。

1. PDF のネイティブ信号を抽出する。
2. その信号が信頼できるかを確認する。
3. 必要な根拠がある場所を特定する。
4. そのページや領域だけをレンダリングまたは OCR する。

これは人間が PDF を読む流れに近いものです。ページをざっと見て、視覚的なページと抽出テキストが食い違う場所に気づき、グラフやフォーム欄を拡大し、検証できる元の根拠を残します。

## エージェントに渡せるもの

pdfvision は、エージェントが必要とする PDF 信号を CLI と TypeScript ライブラリの両方で提供します。

- Unicode 正規化済みのネイティブテキストと、必要に応じた raw text。
- 文字数、画像数、ベクター数、テキストカバレッジ、ネイティブテキスト状態などのページ別品質フィールド。
- レイアウトブロック、見出し、複数カラムの読み順、縦書き CJK、数値表ヒント、繰り返しヘッダー/フッター検出。
- Vision モデル向けのレンダリング PNG とターゲット領域クロップ。
- スキャンまたは画像主体ページ向けの OCR テキスト、信頼度、言語、単語 bbox。
- ネイティブテキスト、フォーム値、FreeText 注釈、OCR を横断した検索一致と bbox。
- 図、グラフ、表、フォーム、ダイアグラムの候補になる raster image box、vector box、visual region。
- 必要に応じたフォームフィールド、リンク、注釈、アウトライン、ページラベル、レイヤー、viewer 設定、構造ツリー、添付ファイルメタデータ。
- 文字化け、疑わしい OCR レイヤー、密なベクター図、平坦化された表、重なった文字、ページ外コンテンツ、隠しレイヤーリスク、読み順の乖離など、人間が気づく違和感に対応する警告。

## クイックスタート

インストールせずに実行します。

```bash
npx pdfvision document.pdf
```

マルチモーダルモデル向けにページ画像をレンダリングします。

```bash
npx pdfvision document.pdf --render
```

URL から PDF を取得して JSON で抽出します。

```bash
npx pdfvision --remote https://raw.githubusercontent.com/mozilla/pdf.js-sample-files/master/tracemonkey.pdf --format json
```

根拠を検索し、一致領域だけをクロップします。

```bash
npx pdfvision report.pdf --search "revenue" --json
npx pdfvision report.pdf --pages 3 --render --render-region 120,180,360,140 --render-output ./crops --json
```

全ページをレンダリングせずに視覚構造を調べます。

```bash
npx pdfvision slides.pdf --layout --image-boxes --vector-boxes --visual-regions --json
npx pdfvision slides.pdf --render-visual-regions --render-output ./regions --json
```

## ドキュメント

- [はじめに](./guide/) で基本の流れを確認できます。
- [ユースケース](./guide/use-cases) は PDF 種別ごとの実行パターンを整理しています。
- [CLI オプション](./guide/command-line-options) は用途別に主要フラグを整理しています。
- [構造化出力](./guide/structured-output) はエージェントやツールが読むフィールドを説明します。
- [レイアウトと警告](./guide/layout-and-warnings) は README の短い説明から分離すべき視覚構造の詳細です。
- [レンダリングと OCR](./guide/rendering-and-ocr) は画像出力、領域クロップ、スキャン文書を扱います。
- [検索と領域ズーム](./guide/search-and-region-zoom) はテキスト根拠を探し、一致領域だけをレンダリングする流れを説明します。
